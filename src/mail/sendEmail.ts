import config from "../config";
import nodemailer from "nodemailer";
import { APP_CONFIG } from "../constants/constants";

const transporter = nodemailer.createTransport({
  host: config.mail.SMTP_HOST,
  port: config.mail.SMTP_PORT,
  secure: config.mail.SMTP_PORT === 465,
  auth: {
    user: config.mail.SMTP_USER,
    pass: config.mail.SMTP_APP_PASS,
  },
});

export const sendEmail = async (data: {
  to: string;
  subject: string;
  html: string;
}) => {
  const info = await transporter.sendMail({
    from: `${APP_CONFIG.APP_NAME} <${config.mail.SMTP_DEFAULT_MAIL}>`,
    to: data.to,
    subject: data.subject,
    html: data.html,
  });

  console.log("Message sent:", info.messageId);
};
