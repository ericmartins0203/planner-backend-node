import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import dayjs from "dayjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getMailClient } from "../lib/mail";
import nodemailer from "nodemailer";
import { ClientError } from "../errors/client-error";
import { env } from "../env";

export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips",
    {
      schema: {
        body: z.object({
          destination: z.string().min(4),
          starts_at: z.coerce.date(),
          ends_at: z.coerce.date(),
          owner_name: z.string().min(3),
          owner_email: z.string().email(),
          emails_to_invite: z.array(z.string().email()),
        }),
      },
    },
    async (request, reply) => {
      const {
        destination,
        starts_at,
        ends_at,
        owner_name,
        owner_email,
        emails_to_invite,
      } = request.body;

      if (dayjs(starts_at).isBefore(new Date())) {
        throw new ClientError("Start date must be in the future");
      }

      if (dayjs(ends_at).isBefore(dayjs(starts_at))) {
        throw new ClientError("End date must be after start date");
      }

      const trip = await prisma.trip.create({
        data: {
          destination,
          starts_at,
          ends_at,
          participants: {
            createMany: {
              data: [
                {
                  email: owner_email,
                  name: owner_name,
                  is_owner: true,
                  is_confirmed: true,
                },
                ...emails_to_invite.map((email) => ({
                  email,
                  name: "",
                })),
              ],
            },
          },
        },
      });

      const mail = await getMailClient();

      const message = await mail.sendMail({
        from: {
          name: "Equipe plann.er",
          address: "K5R7M@example.com",
        },
        to: {
          name: owner_name,
          address: owner_email,
        },
        subject: `Confirme sua viagem para ${destination}`,
        html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;"> 
          <p>Você solicitou a criação de uma viagem para <strong>${destination}</strong>, a partir de <strong>${dayjs(
          starts_at
        ).format("DD/MM/YYYY")} a ${dayjs(ends_at).format(
          "DD/MM/YYYY"
        )}</strong>.</p>
          <p></p>
          <p>Para confirmar sua viagem, clique no link abaixo:</p>
          <p></p>
          <p> <a href="${env.API_BASE_URL}/trips/${
            trip.id
          }/confirm"> Confirmar viagem </a></p>
          <p></p>
          <p>Caso você não saida da viagem, ignore este e-mail.</p>
        </div>
      `.trim(),
      });

      console.log(nodemailer.getTestMessageUrl(message));

      return reply.status(201).send(trip);
    }
  );
}
