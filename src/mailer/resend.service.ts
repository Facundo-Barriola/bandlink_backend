import { Injectable } from "@nestjs/common";
import { Resend } from 'resend';

@Injectable()
export class MailerService {
    private readonly resend = new Resend(process.env.RESEND_API_KEY);

    async sendVerificationMail(to: string, token: string){
        const verifyURL = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

        const {data, error} = await this.resend.emails.send({
                from: process.env.MAIL_FROM!,
                to,
                subject: 'Verifica tu cuenta de Bandlink',
                html:  `
                <h2>Bienvenido a BandLink</h2>
                <p>Hacé click en el siguiente enlace para verificar tu cuenta:</p>
                <a href="${verifyURL}">${verifyURL}</a>
                `,
        });

        if (error) {
            throw new Error(error.message);
        }

        return data;
    }

    async sendResetPasswordEmail(to: string, token: string) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const { data, error } = await this.resend.emails.send({
      from: process.env.MAIL_FROM!,
      to,
      subject: 'Restablecer contraseña',
      html: `
        <h2>Restablecer contraseña</h2>
        <p>Hacé click en el siguiente enlace para cambiar tu contraseña:</p>
        <a href="${resetUrl}">${resetUrl}</a>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}