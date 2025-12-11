import { Prisma } from "@prisma/client"

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