require('dotenv').config({ quiet: true });

const { app } = require('./app');

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Meditations Chat disponible en el puerto ${port}`);
});

module.exports = server;
