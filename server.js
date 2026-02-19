const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/authRoute');
app.use('/api/auth', authRoutes);

const mapRoutes = require('./routes/mapRoute');
app.use('/api/map', mapRoutes);

const PORT = process.env.PORT || 2026;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});