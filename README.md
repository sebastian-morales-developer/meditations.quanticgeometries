# Meditations Quantic Geometries

Entorno de chat responsive construido con Node.js, Express, Bootstrap y JavaScript tradicional.

## Funcionalidades

- Creación y selección de conversaciones independientes.
- Historial de mensajes por conversación mientras el servidor está activo.
- Respuestas automáticas con código aleatorio y timestamp.
- Interfaz adaptable a escritorio, tablet y celular.
- Envío con `Enter` y salto de línea con `Shift + Enter`.
- API validada mediante pruebas automatizadas.

## Uso local

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en el navegador.

## Pruebas

```bash
npm test
```

Las conversaciones se almacenan en memoria y se reinician al detener el servidor.
