import { Prisma } from "@prisma/client"
import { Customer } from "./Customer"
import { Item } from "./Item"
import { prisma } from "../prisma"
import { FileUpload, WithoutFunctions } from "./helpers"
import Fuse from "fuse.js"
import { saveFile } from "../tools/saveFile"
import { UploadedFile } from "express-fileupload"
import { PdfField, PdfHandler } from "./PdfHandler"
import { currencyMask } from "../tools/currencyMask"

export const order_include = Prisma.validator<Prisma.OrderInclude>()({
    customer: true,
})
type OrderPrisma = Prisma.OrderGetPayload<{ include: typeof order_include }>

export type OrderType = "budget" | "order"
export interface DeliveryDate {
    from: number
    to: number
}

export interface Attachment {
    id: string
    filename: string
    url: string
    width: number
    height: number
}

export type OrderForm = Omit<WithoutFunctions<Order>, "id" | "images"> & { images?: Attachment[] }

export class Order {
    id: string
    number: string
    type: OrderType
    order_date: number
    observations?: string
    payment_terms?: string

    // json fields
    images: Attachment[]
    delivery_date?: DeliveryDate
    items: Item[]

    customerId?: string
    customer: Customer

    static async list() {
        const result = await prisma.order.findMany({ include: order_include })
        return result.map((order) => new Order(order))
    }

    static async get(id: string) {
        const result = await prisma.order.findUnique({ where: { id }, include: order_include })
        if (result) return new Order(result)
        return null
    }

    static async getNextAvailableNumber() {
        const lastOrder = await prisma.order.findFirst({
            orderBy: { number: "desc" },
        })
        if (lastOrder) {
            const lastNumber = Number(lastOrder.number)
            return lastNumber + 1
        }
        return 1
    }

    static async validateNumber(number: string) {
        const order = await prisma.order.findUnique({ where: { number } })
        return order ? false : true
    }

    static async query(value: string) {
        const list = await Order.list()
        const customerResult = await Customer.query(value)

        const keys: (keyof Order)[] = ["number"]
        const fuse = new Fuse(list, {
            keys,
            threshold: 0.2,
        })
        const results = fuse.search(value).map((result) => result.item)

        for (const customer of customerResult) {
            const customerOrders = list.filter((order) => order.customerId === customer.id)
            for (const order of customerOrders) {
                if (!results.find((r) => r.id === order.id)) {
                    results.push(order)
                }
            }
        }

        return results
    }

    static async create(data: OrderForm) {
        const created = await prisma.order.create({
            data: {
                customer: {
                    connectOrCreate: {
                        where: { id: data.customer.id || "create" },
                        create: {
                            name: data.customer.name,
                            city: data.customer.city,
                            cnpj: data.customer.cnpj,
                            company_name: data.customer.company_name,
                            state_registration: data.customer.state_registration,
                            street: data.customer.street,
                            neighborhood: data.customer.neighborhood,
                            state: data.customer.state,
                            phone: data.customer.phone,
                        },
                    },
                },
                items: JSON.stringify(data.items),
                number: data.number,
                order_date: data.order_date.toString(),
                type: data.type,
                observations: data.observations,
                images: JSON.stringify([]),
                delivery_date: data.delivery_date ? JSON.stringify(data.delivery_date) : undefined,
                payment_terms: data.payment_terms,
            },
            include: order_include,
        })
        return new Order(created)
    }

    constructor(data: OrderPrisma) {
        this.id = data.id
        this.number = data.number
        this.type = data.type as OrderType
        this.order_date = Number(data.order_date)
        this.observations = data.observations || undefined
        this.images = data.images ? JSON.parse(data.images as string) : []
        this.delivery_date = data.delivery_date ? JSON.parse(data.delivery_date as string) : undefined
        this.payment_terms = data.payment_terms || undefined

        this.customerId = data.customerId
        this.customer = new Customer(data.customer)
        this.items = JSON.parse(data.items as string)
    }

    async update(data: Partial<OrderForm>) {
        const result = await prisma.order.update({
            where: { id: this.id },
            data: {
                delivery_date: data.delivery_date ? JSON.stringify(data.delivery_date) : undefined,
                observations: data.observations,
                payment_terms: data.payment_terms,
                items: data.items ? JSON.stringify(data.items) : undefined,
                images: data.images ? JSON.stringify(data.images) : undefined,
                type: data.type,
                customer: {
                    update: {
                        city: data.customer?.city,
                        cnpj: data.customer?.cnpj,
                        company_name: data.customer?.company_name,
                        state_registration: data.customer?.state_registration,
                        street: data.customer?.street,
                        neighborhood: data.customer?.neighborhood,
                        state: data.customer?.state,
                        phone: data.customer?.phone,
                        name: data.customer?.name,
                    },
                },
            },
            include: order_include,
        })

        Object.assign(this, new Order(result))
        return this
    }

    async delete() {
        await prisma.order.delete({ where: { id: this.id } })
    }

    async uploadImages(images: UploadedFile[], data: Attachment[]) {
        for (const [index, image] of images.entries()) {
            const attachment = data[index]
            attachment.url = saveFile(`orders/${this.id}`, image.data, image.name).url
            this.images.push(attachment)
        }
        await this.update({ images: this.images })
        return this
    }

    async deleteImage(attachment_id: string) {
        const updatedImages = this.images.filter((img) => img.id !== attachment_id)
        await this.update({ images: updatedImages })
        return this
    }

    getTotal() {
        return this.items.reduce((total, item) => total + item.unit_price * item.quantity, 0)
    }

    async exportPdf() {
        const fields: PdfField[] = [
            { name: "order_budget", value: this.type === "budget" ? "true" : "", type: "checkbox" },
            { name: "order_not_budget", value: this.type === "order" ? "true" : "", type: "checkbox" },
            { name: "order_number", value: this.number },
            { name: "customer_name", value: this.customer.name },
            { name: "customer_company_name", value: this.customer.company_name },
            { name: "customer_cnpj", value: this.customer.cnpj },
            { name: "customer_state_registration", value: this.customer.state_registration },
            { name: "customer_street", value: this.customer.street },
            { name: "customer_neighborhood", value: this.customer.neighborhood },
            { name: "customer_city", value: this.customer.city },
            { name: "customer_state", value: this.customer.state },
            { name: "customer_ddd", value: this.customer.phone?.replace(/\D/g, "").slice(0, 2) },
            { name: "customer_phone", value: this.customer.phone?.replace(/\D/g, "").slice(2) },
            { name: "order_payment_terms", value: this.payment_terms },

            { name: "order_date_day", value: new Date(this.order_date).getDate().toString() },
            { name: "order_date_month", value: (new Date(this.order_date).getMonth() + 1).toString() },
            { name: "order_date_year", value: new Date(this.order_date).getFullYear().toString() },

            { name: "order_total", value: currencyMask(this.getTotal()) },
            { name: "order_observations", value: this.observations },
        ]

        if (this.delivery_date?.from) {
            fields.push(
                { name: "order_delivery_from_day", value: new Date(this.delivery_date.from).getDate().toString() },
                { name: "order_delivery_from_month", value: (new Date(this.delivery_date.from).getMonth() + 1).toString() },
                { name: "order_delivery_from_year", value: new Date(this.delivery_date.from).getFullYear().toString() }
            )
        }

        if (this.delivery_date?.to) {
            fields.push(
                { name: "order_delivery_to_day", value: new Date(this.delivery_date.to).getDate().toString() },
                { name: "order_delivery_to_month", value: (new Date(this.delivery_date.to).getMonth() + 1).toString() },
                { name: "order_delivery_to_year", value: new Date(this.delivery_date.to).getFullYear().toString() }
            )
        }

        for (const [index, item] of this.items.entries()) {
            fields.push(
                { name: `quantity_${index}`, value: item.quantity.toString() },
                { name: `description_${index}`, value: item.description },
                { name: `unit_price_${index}`, value: currencyMask(item.unit_price) },
                { name: `subtotal_${index}`, value: currencyMask(item.unit_price * item.quantity) }
            )
        }

        for (const [index, attachment] of this.images.entries()) {
            fields.push({ name: `Button${index + 1}`, value: attachment.url, type: "image" })
        }

        const maxImages = Math.min(this.images.length, 3)
        const fieldsToDelete: string[] = []
        for (let i = maxImages; i < 3; i++) {
            fieldsToDelete.push(`Button${i + 1}`)
        }

        const pdf = new PdfHandler({
            fields,
            template_path: "src/templates/queirozbrindez_talao.pdf",
            output_dir: "static/orders",
            filename: `${this.type === "budget" ? "orcamento" : "pedido"}_${this.customer.name.replace(/\s+/g, "_")}_${this.number}.pdf`,
        })

        await pdf.fillForm(fieldsToDelete)
        return pdf.fullpath
    }
}
