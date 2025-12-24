// Bot de WhatsApp para Restaurante Dragón Rojo - VERSIÓN CORREGIDA
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const app = express();

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

let sock;
let qrCodeData = null;
let isConnected = false;
let isConnecting = false;
let miNumero = null; // 🆕 Guardar mi número para NO responderme a mí mismo
const PORT = 3000;

// ⏰ CONFIGURACIÓN DE COOLDOWN
const COOLDOWN_MINUTOS = 60;
const COOLDOWN_MS = COOLDOWN_MINUTOS * 60 * 1000;

// Control de mensajes procesados y cooldowns
const mensajesProcesados = new Set();
const usuariosCooldown = new Map();

// Limpiar mensajes antiguos cada 5 minutos
setInterval(() => {
  mensajesProcesados.clear();
  console.log('🧹 Cache de mensajes limpiado');
}, 300000);

// Rutas de las fotos del menú y audio
const MENU_FOTO1 = path.join(__dirname, 'menus', 'menu1.jpg');
const MENU_FOTO2 = path.join(__dirname, 'menus', 'menu2.jpg');
const AUDIO_SALUDO = path.join(__dirname, 'audios', 'saludo.ogg'); // 🆕 Audio de saludo

// Información del restaurante DRAGÓN ROJO
const RESTAURANTE = {
  nombre: "Dragón Rojo",
  saludo: "¡Hola! 👋\nBienvenido a Dragón Rojo 🐉✨",
  horario: "Lunes a Domingo 10:30 AM - 10:00 PM",
  telefono: "+57 3208831598",
  direccion: "Cra. 11 4260, Sogamoso, Boyacá",
  enlacePedidos: "d1714vcs9fzecp.cloudfront.net",
  mensaje_instrucciones: `
👇🏻👇🏻👇🏻 Haz tu pedido aquí 👇🏻👇🏻👇🏻
d1714vcs9fzecp.cloudfront.net

📍 Ubicación en tiempo real para entregas más rápidas

🍜 Instrucciones para Pedido.
1️⃣ Elige tus platos chinos favoritos
2️⃣ Ingresa tu dirección 🏠
3️⃣ ¡Confirma y listo! 🚀

🚴‍♂️ Domicilios hasta la puerta de tu casa

💬 Si prefieres pedir por chat, envíanos tus datos completos:
📌 Nombre completo
📌 Dirección
📌 Barrio
📌 Número de celular

❤️🥡 Estamos listos para atenderte`
};

// Verificar si un usuario está en cooldown
function estaEnCooldown(telefono) {
  if (!usuariosCooldown.has(telefono)) {
    return false;
  }
  
  const ultimaRespuesta = usuariosCooldown.get(telefono);
  const tiempoTranscurrido = Date.now() - ultimaRespuesta;
  
  if (tiempoTranscurrido < COOLDOWN_MS) {
    const minutosRestantes = Math.ceil((COOLDOWN_MS - tiempoTranscurrido) / 60000);
    return minutosRestantes;
  }
  
  // Si ya pasó el tiempo, eliminar del mapa
  usuariosCooldown.delete(telefono);
  return false;
}

// OPTIMIZAR IMÁGENES ANTES DE ENVIAR
async function optimizarImagen(rutaImagen) {
  try {
    const buffer = await sharp(rutaImagen)
      .resize(1280, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ 
        quality: 80,
        progressive: true 
      })
      .toBuffer();
    
    console.log(`📸 Imagen optimizada: ${(buffer.length / 1024).toFixed(2)} KB`);
    return buffer;
  } catch (error) {
    console.log('⚠️  No se pudo optimizar, usando imagen original');
    return fs.readFileSync(rutaImagen);
  }
}

async function connectToWhatsApp() {
  if (isConnecting) {
    console.log('⚠️ Ya hay una conexión en proceso, esperando...');
    return;
  }
  
  if (isConnected) {
    console.log('⚠️ Ya está conectado a WhatsApp');
    return;
  }
  
  isConnecting = true;
  
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      defaultQueryTimeoutMs: undefined,
      browser: ['Chrome (Linux)', '', ''],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      emitOwnEvents: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCodeData = qr;
        console.log('\n📱 Código QR disponible en: http://localhost:3000');
        qrcode.generate(qr, { small: true });
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`❌ Conexión cerrada. Status: ${statusCode}`);
        isConnected = false;
        isConnecting = false;
        qrCodeData = null;
        miNumero = null;
        
        if (shouldReconnect) {
          console.log('🔄 Reconectando en 5 segundos...');
          setTimeout(() => connectToWhatsApp(), 5000);
        } else {
          console.log('\n⛔ SESIÓN CERRADA');
          console.log('🌐 Ve a http://localhost:3000 para limpiar sesión y conectar otro WhatsApp\n');
        }
      } else if (connection === 'open') {
        console.log('✅ ¡Conectado a WhatsApp!');
        
        // 🆕 OBTENER MI NÚMERO
        try {
          const user = sock.user;
          if (user && user.id) {
            miNumero = user.id.split(':')[0];
            console.log(`📱 Mi número: ${miNumero}`);
          }
        } catch (e) {
          console.log('⚠️ No se pudo obtener el número');
        }
        
        console.log('🌐 Panel de control: http://localhost:3000\n');
        isConnected = true;
        isConnecting = false;
        qrCodeData = null;
      }
    });

    // 🔥 RECIBIR MENSAJES - VERSIÓN CORREGIDA
    sock.ev.on('messages.upsert', async (m) => {
      try {
        // Validaciones básicas
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return; // Ignorar mis propios mensajes
        
        const from = msg.key.remoteJid;
        const messageId = msg.key.id;
        
        // Ignorar estados de WhatsApp
        if (from === 'status@broadcast') return;
        
        // 🆕 IGNORAR MI PROPIO NÚMERO
        const remitente = from.split('@')[0];
        if (miNumero && remitente === miNumero) {
          console.log('⛔ Ignorando mensaje de mi propio número');
          return;
        }
        
        // ID único del mensaje
        const idUnico = `${from}-${messageId}`;
        
        // 🔥 VERIFICAR SI YA FUE PROCESADO (Anti-duplicados)
        if (mensajesProcesados.has(idUnico)) {
          console.log('⛔ Mensaje ya procesado, ignorando...');
          return;
        }
        
        // Marcar como procesado INMEDIATAMENTE
        mensajesProcesados.add(idUnico);
        
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '';
        
        const telefono = from.split('@')[0];
        console.log(`\n📩 Mensaje de ${telefono}: ${text}`);

        // 🔥 VERIFICAR COOLDOWN
        const minutosRestantes = estaEnCooldown(from);
        
        if (minutosRestantes) {
          console.log(`⏳ Usuario en cooldown. Faltan ${minutosRestantes} minutos\n`);
          return;
        }

        // 🔥 ACTIVAR COOLDOWN ANTES DE ENVIAR (muy importante!)
        usuariosCooldown.set(from, Date.now());
        console.log(`⏰ Cooldown activado para ${telefono} (${COOLDOWN_MINUTOS} minutos)`);

        // Mostrar "escribiendo..."
        await sock.sendPresenceUpdate('composing', from);
        
        // Enviar respuesta
        await enviarSaludoYMenu(from);
        
        // Pausar indicador de escritura
        await sock.sendPresenceUpdate('paused', from);
        
        console.log(`✅ Respuesta enviada a ${telefono}\n`);

      } catch (error) {
        console.error('❌ Error procesando mensaje:', error.message);
      }
    });
  } catch (error) {
    console.error('❌ Error en conexión:', error.message);
    isConnecting = false;
  }
}

// ENVIAR SALUDO + AUDIO + ENLACE DE PEDIDOS + MENÚ
async function enviarSaludoYMenu(from) {
  try {
    // 1. SALUDO INICIAL (TEXTO)
    await sock.sendMessage(from, { text: RESTAURANTE.saludo });
    console.log('  ✅ Saludo enviado');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. 🆕 ENVIAR AUDIO DE SALUDO (OPCIONAL - Nota de voz)
    if (fs.existsSync(AUDIO_SALUDO)) {
      try {
        const audioBuffer = fs.readFileSync(AUDIO_SALUDO);
        await sock.sendMessage(from, {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus', // Formato de nota de voz de WhatsApp
          ptt: true // 🔥 PTT = Push To Talk (nota de voz)
        });
        console.log('  ✅ Audio de saludo enviado');
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error('  ❌ Error enviando audio:', error.message);
      }
    }

    // 3. MENSAJE CON ENLACE DE PEDIDOS
    await sock.sendMessage(from, { text: RESTAURANTE.mensaje_instrucciones });
    console.log('  ✅ Enlace de pedidos enviado');
    await new Promise(resolve => setTimeout(resolve, 1200));

    // 3. ENVIAR FOTOS DEL MENÚ (OPCIONAL)
    if (fs.existsSync(MENU_FOTO1)) {
      try {
        const foto1 = await optimizarImagen(MENU_FOTO1);
        await sock.sendMessage(from, {
          image: foto1,
          caption: '📋 Menú - Página 1'
        });
        console.log('  ✅ Foto 1 enviada');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('  ❌ Error enviando foto 1:', error.message);
      }
    }

    if (fs.existsSync(MENU_FOTO2)) {
      try {
        const foto2 = await optimizarImagen(MENU_FOTO2);
        await sock.sendMessage(from, {
          image: foto2,
          caption: '📋 Menú - Página 2'
        });
        console.log('  ✅ Foto 2 enviada');
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (error) {
        console.error('  ❌ Error enviando foto 2:', error.message);
      }
    }

    // 4. MENSAJE FINAL DE CONTACTO - DESACTIVADO
    // Si quieres enviarlo, descomenta este bloque:
    /*
    const cierre = `📱 *¿Prefieres llamar?*

📞 Llámanos: ${RESTAURANTE.telefono}
📍 Visítanos: ${RESTAURANTE.direccion}
🕐 Horario: ${RESTAURANTE.horario}

¡Gracias por elegirnos! 🐉❤️`;

    await sock.sendMessage(from, { text: cierre });
    console.log('  ✅ Mensaje de cierre enviado');
    */

  } catch (error) {
    console.error('❌ Error enviando secuencia:', error.message);
    
    try {
      await sock.sendMessage(from, { 
        text: '⚠️ Hubo un problema, pero puedes hacer tu pedido aquí: https://surl.li/gstbzb 🐉' 
      });
    } catch (e) {
      console.error('❌ Error crítico:', e.message);
    }
  }
}

// ==================== ENDPOINTS API ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
  const usuariosActivos = Array.from(usuariosCooldown.entries()).map(([telefono, timestamp]) => {
    const tiempoRestante = Math.max(0, COOLDOWN_MS - (Date.now() - timestamp));
    const minutosRestantes = Math.ceil(tiempoRestante / 60000);
    
    return {
      telefono: telefono.split('@')[0],
      ultimaRespuesta: new Date(timestamp).toLocaleString('es-CO'),
      minutosRestantes: minutosRestantes > 0 ? minutosRestantes : 0,
      puedeResponder: minutosRestantes === 0
    };
  });

  res.json({ 
    status: isConnected ? 'conectado' : 'desconectado',
    restaurante: RESTAURANTE.nombre,
    cooldownMinutos: COOLDOWN_MINUTOS,
    mensajesProcesados: mensajesProcesados.size,
    usuariosEnCooldown: usuariosActivos,
    miNumero: miNumero || 'No disponible'
  });
});

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.json({ qr: qrCodeData, connected: false });
  } else if (isConnected) {
    res.json({ qr: null, connected: true });
  } else {
    res.json({ qr: null, connected: false });
  }
});

app.post('/reset-cooldown/:telefono', (req, res) => {
  const telefono = req.params.telefono + '@s.whatsapp.net';
  
  if (usuariosCooldown.has(telefono)) {
    usuariosCooldown.delete(telefono);
    console.log(`✅ Cooldown eliminado para ${req.params.telefono}`);
    res.json({ 
      message: `Cooldown eliminado para ${req.params.telefono}`,
      puedeResponder: true 
    });
  } else {
    res.json({ 
      message: `El usuario ${req.params.telefono} no tiene cooldown activo` 
    });
  }
});

app.post('/reset-all-cooldowns', (req, res) => {
  const cantidad = usuariosCooldown.size;
  usuariosCooldown.clear();
  console.log(`✅ ${cantidad} cooldowns eliminados`);
  res.json({ 
    message: `${cantidad} cooldowns eliminados correctamente` 
  });
});

app.post('/clear-cache', (req, res) => {
  mensajesProcesados.clear();
  console.log('✅ Cache limpiado');
  res.json({ message: 'Cache limpiado correctamente' });
});

app.post('/force-reconnect', async (req, res) => {
  try {
    console.log('🔄 Reconexión forzada solicitada');
    
    if (isConnected) {
      return res.json({ 
        message: 'Ya está conectado a WhatsApp. No es necesario reconectar.',
        success: false,
        connected: true
      });
    }
    
    if (sock) {
      try {
        sock.end();
      } catch (e) {
        console.log('⚠️ Socket cerrado forzadamente');
      }
    }
    
    isConnected = false;
    isConnecting = false;
    qrCodeData = null;
    miNumero = null;
    
    setTimeout(() => {
      console.log('📱 Iniciando nueva conexión...');
      connectToWhatsApp();
    }, 1000);
    
    res.json({ 
      message: 'Reconexión forzada. Generando nuevo QR...',
      success: true
    });
  } catch (error) {
    console.error('❌ Error en reconexión forzada:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/logout', async (req, res) => {
  try {
    if (sock && isConnected) {
      await sock.logout();
      isConnected = false;
      isConnecting = false;
      qrCodeData = null;
      miNumero = null;
      console.log('✅ Sesión cerrada');
      
      setTimeout(() => {
        console.log('🔄 Iniciando nueva conexión...');
        connectToWhatsApp();
      }, 2000);
      
      res.json({ message: 'Sesión cerrada correctamente. Generando nuevo QR...' });
    } else {
      res.json({ message: 'No hay sesión activa para cerrar' });
    }
  } catch (error) {
    console.error('❌ Error cerrando sesión:', error.message);
    isConnecting = false;
    res.status(500).json({ error: error.message });
  }
});

app.post('/clear-session', async (req, res) => {
  try {
    const authFolder = path.join(__dirname, 'auth_info');
    
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.log('⚠️ Forzando cierre de sesión...');
      }
    }
    
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
      isConnected = false;
      isConnecting = false;
      qrCodeData = null;
      miNumero = null;
      console.log('✅ Sesión limpiada completamente');
      
      setTimeout(() => {
        console.log('🔄 Iniciando nueva conexión para otro WhatsApp...');
        connectToWhatsApp();
      }, 3000);
      
      res.json({ 
        message: 'Sesión limpiada correctamente. Generando nuevo QR en 3 segundos...',
        needsRestart: false,
        autoReconnect: true
      });
    } else {
      console.log('📱 No hay sesión activa, creando nueva...');
      isConnected = false;
      isConnecting = false;
      miNumero = null;
      
      setTimeout(() => {
        connectToWhatsApp();
      }, 2000);
      
      res.json({ 
        message: 'Creando nueva sesión. Generando QR...',
        needsRestart: false,
        autoReconnect: true
      });
    }
  } catch (error) {
    console.error('❌ Error limpiando sesión:', error.message);
    isConnecting = false;
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🐉 BOT DE WHATSAPP - DRAGÓN ROJO 🐉`);
  console.log(`🌐 Panel de Control: http://localhost:${PORT}`);
  console.log(`📊 API Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Enlace de pedidos: ${RESTAURANTE.enlacePedidos}\n`);
  
  // Verificar fotos del menú
  console.log('📁 Verificando archivos multimedia...');
  if (fs.existsSync(MENU_FOTO1)) {
    const size1 = (fs.statSync(MENU_FOTO1).size / 1024).toFixed(2);
    console.log(`✅ menu1.jpg encontrado (${size1} KB)`);
  } else {
    console.log('⚠️  menu1.jpg NO encontrado (opcional)');
  }
  
  if (fs.existsSync(MENU_FOTO2)) {
    const size2 = (fs.statSync(MENU_FOTO2).size / 1024).toFixed(2);
    console.log(`✅ menu2.jpg encontrado (${size2} KB)`);
  } else {
    console.log('⚠️  menu2.jpg NO encontrado (opcional)');
  }
  
  if (fs.existsSync(AUDIO_SALUDO)) {
    const sizeAudio = (fs.statSync(AUDIO_SALUDO).size / 1024).toFixed(2);
    console.log(`✅ saludo.ogg encontrado (${sizeAudio} KB)`);
  } else {
    console.log('⚠️  saludo.ogg NO encontrado (opcional)');
  }
  
  console.log('\n⚡ CONFIGURACIÓN:');
  console.log('   • Respuesta automática: ACTIVADA');
  console.log('   • Audio de saludo: ' + (fs.existsSync(AUDIO_SALUDO) ? 'INCLUIDO ✅' : 'Desactivado'));
  console.log('   • Enlace de pedidos: INCLUIDO ✅');
  console.log('   • Anti-duplicados: MEJORADO 🔥');
  console.log('   • NO responde a mi propio número: ✅');
  console.log('   • Optimización de imágenes: ACTIVADA');
  console.log(`   • ⏰ Cooldown: ${COOLDOWN_MINUTOS} minutos entre respuestas`);
  console.log('   • 🌐 Interfaz Web: ACTIVADA\n');
  
  const publicFolder = path.join(__dirname, 'public');
  if (!fs.existsSync(publicFolder)) {
    fs.mkdirSync(publicFolder);
    console.log('📁 Carpeta "public" creada\n');
  }
  
  connectToWhatsApp();
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Error no manejado:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Excepción no capturada:', err.message);
});