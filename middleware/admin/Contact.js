const firebase = require('../../database/firebase');
const nodemailer = require('nodemailer')
const fs = require('fs');
const ejs = require('ejs');
const path = require("path");
const {get} = require("axios");
class Contact {
    music =  [];
    async sendEmail(data) {
        new Promise(async (resolve, reject) => {
            if (!data.email || !data.name || !data.message || !data.tel) {
                throw Error('INVALID_PARAMS');
            }
            const transporter = nodemailer.createTransport({
                host: 'mail.colocservice.fr',
                port: 465, // Use the appropriate port (587 for TLS or 465 for SSL)
                secure: true, // true for 465, false for other ports
                auth: {
                    user: 'contact@colocservice.fr', // Replace with your OVH email address
                    pass: 'sT100573!', // Replace with your OVH email password or application-specific password
                },

            });
            const image = await fs.promises.readFile('templates/logo.png');
            data.image = `data:image/jpeg;base64,${image.toString('base64')}`;
            const emailHtml = await this.renderEmailTemplate('templates/contact.ejs', data);
            const mailOptions = {
                from: 'colocservice@hotmail.com', // Sender's email address
                to: data.email, // Recipient's email address
                subject: "CREATOKE : ✉️ Nouveau message" , // Email subject
                html: emailHtml
            };

            // Send the email
            await transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error)
                    reject(error)
                } else {
                    resolve("Merci, votre candidature à été envoyée");
                }
            });
        })
    }

    async sendEmailPayment(data) {
        new Promise(async (resolve, reject) => {
            const transporter = nodemailer.createTransport({
                host: 'mail.colocservice.fr',
                port: 465, // Use the appropriate port (587 for TLS or 465 for SSL)
                secure: true, // true for 465, false for other ports
                auth: {
                    user: 'contact@colocservice.fr', // Replace with your OVH email address
                    pass: 'sT100573!', // Replace with your OVH email password or application-specific password
                },

            });
            const imageBuffer = await fs.promises.readFile('templates/logo.png');
            data.logo = imageBuffer.toString('base64');

            const emailHtml = await this.renderEmailTemplate('templates/purchase-confirm.ejs', data);
            const mailOptions = {
                from: 'contact@colocservice.fr',
                to: data.email_client,
                subject: "Créatoké : Merci pour votre achat." , // Email subject
                html: emailHtml,
            };
            await transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error)
                    reject(error)
                } else {
                    resolve("OK");
                }
            });
        })
    }

    async renderEmailTemplate(templatePath, data) {
        const template = await fs.promises.readFile(templatePath, 'utf8');
        return ejs.render(template, data);
    }
}

module.exports = { Contact }
