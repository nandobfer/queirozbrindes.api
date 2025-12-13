import { Prisma } from "@prisma/client"
import { Customer } from "./Customer"
import { Item } from "./Item"
import { prisma } from "../prisma"
import { WithoutFunctions } from "./helpers"
import Fuse from "fuse.js"

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
    filename: string
    url: string
}

export type OrderForm = Omit<WithoutFunctions<Order>, "id">

export class Order {
    id: string
    number: string
    type: OrderType
    order_date: number
    observations?: string
    payment_terms?: string

    // json fields
    images?: Attachment[]
    drawings?: Attachment[]
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
                images: data.images ? JSON.stringify(data.images) : undefined,
                drawings: data.drawings ? JSON.stringify(data.drawings) : undefined,
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
        this.images = data.images ? JSON.parse(data.images as string) : undefined
        this.drawings = data.drawings ? JSON.parse(data.drawings as string) : undefined
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
                images: data.images ? JSON.stringify(data.images) : undefined,
                drawings: data.drawings ? JSON.stringify(data.drawings) : undefined,
                observations: data.observations,
                payment_terms: data.payment_terms,
                items: data.items ? JSON.stringify(data.items) : undefined,
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
}
