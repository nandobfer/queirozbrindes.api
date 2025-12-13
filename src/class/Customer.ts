import { Prisma } from "@prisma/client"
import { prisma } from "../prisma"
import Fuse from "fuse.js"

type CustomerPrisma = Prisma.CustomerGetPayload<{}>

export class Customer {
    id: string
    name: string
    company_name?: string
    cnpj?: string
    state_registration?: string
    street?: string
    neighborhood?: string
    city?: string
    state?: string
    phone?: string

    static async list() {
        const result = await prisma.customer.findMany()
        return result.map((data) => new Customer(data))
    }

    static async query(value: string) {
        const list = await Customer.list()
        const fuse = new Fuse(list, {
            keys: ["name"],
            threshold: 0.2,
        })
        const results = fuse.search(value)
        return results.map((result) => result.item)
    }

    constructor(data: CustomerPrisma) {
        this.id = data.id
        this.name = data.name
        this.company_name = data.company_name || undefined
        this.cnpj = data.cnpj || undefined
        this.state_registration = data.state_registration || undefined
        this.street = data.street || undefined
        this.neighborhood = data.neighborhood || undefined
        this.city = data.city || undefined
        this.state = data.state || undefined
        this.phone = data.phone || undefined
    }
}
