require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const useragent = require('express-useragent');
const Sentiment = require('sentiment');

// Model
const Contact = require('./models/Contact');

const app = express();
const sentiment = new Sentiment();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(useragent.express());

// Rate Limiter
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many requests from this IP, please try again after an hour.' },
});
app.use('/api/contact', limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Nodemailer setup with Office365
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3',
  },
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message, website } = req.body;

    if (website) return res.status(400).json({ message: 'Spam detected.' });

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ua = req.useragent.source;
    const sentimentResult = sentiment.analyze(message);
    const sentimentScore = sentimentResult.score;

    const contact = new Contact({ name, email, message, ip, userAgent: ua, sentimentScore });
    await contact.save();

    const mailToOwner = {
      from: `"Portfolio Contact" <${process.env.SMTP_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'New Contact Form Submission',
      html: `
        <h3>Contact Details</h3>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Message:</b> ${message}</p>
        <p><b>IP:</b> ${ip}</p>
        <p><b>User Agent:</b> ${ua}</p>
        <p><b>Sentiment Score:</b> ${sentimentScore}</p>
      `,
    };

    const mailToUser = {
      from: `"Tejas Padaki" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting!',
      html: `<p>Hi ${name},<br />Thanks for reaching out. I’ll get back to you soon.<br /><br />Regards,<br/>Tejas Padaki</p>`,
    };

    await Promise.all([
      transporter.sendMail(mailToOwner),
      transporter.sendMail(mailToUser),
    ]);

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
