# Meditations Quantic Geometries

Entorno de chat responsive construido con Node.js, Express, Bootstrap, JavaScript tradicional y la API de OpenAI.

## Funcionalidades

- Creación y selección de conversaciones independientes.
- Selector de modalidad independiente para cada conversación.
- Historial de mensajes por conversación mientras el servidor está activo.
- Respuestas automáticas con código aleatorio y timestamp.
- Respuestas breves generadas con GPT-5.6 Sol mediante la Responses API.
- Dictado por micrófono con transcripción mediante `gpt-transcribe`.
- Inserción de la transcripción en la posición del cursor, sin enviar el mensaje automáticamente.
- Interfaz adaptable a escritorio, tablet y celular.
- Envío con `Enter` y salto de línea con `Shift + Enter`.
- API validada mediante pruebas automatizadas.

## Uso local

Requiere Node.js 20 o superior. Copia `.env.example` como `.env` y configura tu clave sin compartirla ni subirla al repositorio:

```text
OPENAI_API_KEY=tu_clave_local
```

Después instala las dependencias e inicia el proyecto:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en el navegador.

Para dictar, permite el acceso al micrófono cuando el navegador lo solicite. Presiona el botón del micrófono para comenzar y vuelve a presionarlo para detener. La grabación se limita a dos minutos y se transcribe en el servidor, por lo que la clave de OpenAI nunca se expone al navegador.

El estado del servidor puede comprobarse en `http://localhost:3000/health`.

## Pruebas

```bash
npm test
```

Las conversaciones se almacenan en memoria y se reinician al detener el servidor.

Los modos disponibles se administran en `config/conversation-types.json`. En Hostinger, configura `OPENAI_API_KEY` desde **Variables de entorno**; no subas el archivo `.env`.
