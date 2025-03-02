const firebase = require('../../database/firebase');
const nodemailer = require('nodemailer')
const fs = require('fs');
const ejs = require('ejs');
const dotenv = require('dotenv');

dotenv.config();

const transporter = nodemailer.createTransport({
    host: 'mail.colocservice.fr',
    service: 'mail.creatoke.net',
    host: 'mail.creatoke.net',
    port: 465,
    secure: true,
    auth: {
        user: process.env.user,
        pass: process.env.password,
    },
});

function mailOptions(sender, subject, emailHtml) {
    return {
        from: process.env.user,
        to: sender,
        subject: subject,
        html: emailHtml
    }
};

class Contact {
    music = [];
    async sendEmail(data) {
        new Promise(async (resolve, reject) => {
            if (!data.email || !data.name || !data.message || !data.tel) {
                throw Error('INVALID_PARAMS');
            }
            const image = await fs.promises.readFile('templates/logo.png');
            data.image = `data:image/jpeg;base64,${image.toString('base64')}`;
            const emailHtml = await this.renderEmailTemplate('templates/contact.ejs', data);

            await transporter.sendMail(mailOptions(data.email, "CREATOKE : ✉️ Nouveau message", emailHtml), (error, info) => {
                if (error) {
                    console.log(error)
                    reject(error)
                } else {
                    resolve("Merci, votre candidature à été envoyée");
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
