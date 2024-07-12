import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import dayjs from "dayjs";
import { getMailClient } from "../lib/mail";
import nodemailer from "nodemailer";
import { ClientError } from "../errors/client-error";
import { env } from "../env";

export async function createInvite(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips/:tripId/invites",
    {
      schema: {
        params: z.object({
          tripId: z.string().uuid(),
        }),
        body: z.object({
          email: z.string().email(),
        }),
      },
    },
    async (request, reply) => {
      const { tripId } = request.params;
      const { email } = request.body;

      const trip = await prisma.trip.findUnique({
        where: {
          id: tripId,
        },
      });

      if (!trip) {
        throw new ClientError("Trip not found");
      }

      const participant = await prisma.participant.create({
        data: {
          email,
          trip_id: tripId,
        },
      });

      const mail = await getMailClient();

      const message = await mail.sendMail({
        from: {
          name: "Equipe plann.er",
          address: "K5R7M@example.com",
        },
        to: participant.email,
        subject: `Confirme sua presença na viagem para ${trip.destination}`,
        html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;"> 
          <p>Você foi convidado(a) para participar de uma viagem para <strong>${trip.destination}</strong>, a partir de <strong>${dayjs(
          trip.starts_at
        ).format("DD/MM/YYYY")}</strong> a <strong>${dayjs(trip.ends_at).format(
          "DD/MM/YYYY"
        )}</strong>.</p>
          <p></p>
          <p>Para confirmar sua presença na viagem, clique no link abaixo:</p>
          <p></p>
          <p> <a href="${env.API_BASE_URL}/participants/${participant.id}}/confirm"> Confirmar viagem </a></p>
          <p></p>
          <p>Caso você não saida da viagem, ignore este e-mail.</p>
        </div>
      `.trim(),
      });    
      console.log(nodemailer.getTestMessageUrl(message));
  

      return reply.status(201).send({
        participant: participant});
    }
  );
}
