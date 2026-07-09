const nodemailer = require('nodemailer');
require('dotenv').config();

async function sendMail(options) {
    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.email,
                pass: process.env.mailKey,
            }
        })
            const mailOption = {
              from: process.env.email,
              to: options.email,
              subject: options.subject,
              text: options.text,
              html: options.html
            };
        
            await transporter.sendMail(mailOption);   
            return {
                success: true,
                message: 'Email sent successfully',
            }
    } catch (err) {
        console.error('Error sending mail:', err.message);
        return {
            success: false,
            message: 'Error sending mail: ' + err.message,
        };
    }
}

module.exports = sendMail;
