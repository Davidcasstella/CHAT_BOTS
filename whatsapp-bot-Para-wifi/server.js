// Bot de WhatsApp para Auditoría de Redes WiFi - VERSIÓN MODIFICADA
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

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
let miNumero = null;
const PORT = 3000;

// ⏰ CONFIGURACIÓN DE COOLDOWN
const COOLDOWN_MINUTOS = 30;
const COOLDOWN_MS = COOLDOWN_MINUTOS * 60 * 1000;

// Control de mensajes procesados y cooldowns
const mensajesProcesados = new Set();
const usuariosCooldown = new Map();

// Limpiar mensajes antiguos cada 5 minutos
setInterval(() => {
  mensajesProcesados.clear();
  console.log('🧹 Cache de mensajes limpiado');
}, 300000);

// 🆕 RUTAS DE ARCHIVOS MULTIMEDIA (Audio + Videos)
const AUDIO_SALUDO = path.join(__dirname, 'audios', 'saludo.ogg');
const VIDEO_1 = path.join(__dirname, 'videos', 'video1.mp4');
const VIDEO_2 = path.join(__dirname, 'videos', 'video2.mp4');

// 🆕 INFORMACIÓN DEL PROYECTO DE AUDITORÍA WIFI
const PROYECTO = {
  nombre: "Auditoría de Redes WiFi",
  instrucciones: `📱 *Instrucciones:*

Si tienes *Android*, descarga esta aplicación:
https://play.google.com/store/apps/details?id=com.vrem.wifianalyzer

Si tienes *iPhone*, descarga esta aplicación:
https://play.google.com/store/apps/details?id=com.vrem.wifianalyzer

Te voy a enviar dos videos explicativos 👇`
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
  
  usuariosCooldown.delete(telefono);
  return false;
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

    // 🔥 RECIBIR MENSAJES
    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;
        
        const from = msg.key.remoteJid;
        const messageId = msg.key.id;
        
        if (from === 'status@broadcast') return;
        
        const remitente = from.split('@')[0];
        if (miNumero && remitente === miNumero) {
          console.log('⛔ Ignorando mensaje de mi propio número');
          return;
        }
        
        const idUnico = `${from}-${messageId}`;
        
        if (mensajesProcesados.has(idUnico)) {
          console.log('⛔ Mensaje ya procesado, ignorando...');
          return;
        }
        
        mensajesProcesados.add(idUnico);
        
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '';
        
        const telefono = from.split('@')[0];
        console.log(`\n📩 Mensaje de ${telefono}: ${text}`);

        const minutosRestantes = estaEnCooldown(from);
        
        if (minutosRestantes) {
          console.log(`⏳ Usuario en cooldown. Faltan ${minutosRestantes} minutos\n`);
          return;
        }

        usuariosCooldown.set(from, Date.now());
        console.log(`⏰ Cooldown activado para ${telefono} (${COOLDOWN_MINUTOS} minutos)`);

        await sock.sendPresenceUpdate('composing', from);
        
        // 🆕 ENVIAR SECUENCIA: AUDIO → MENSAJE → VIDEOS
        await enviarContenidoEducativo(from);
        
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

// 🆕 FUNCIÓN PRINCIPAL: ENVIAR AUDIO + INSTRUCCIONES + VIDEOS
async function enviarContenidoEducativo(from) {
  try {
    // 1️⃣ ENVIAR AUDIO DE SALUDO (PRIMERO)
    if (fs.existsSync(AUDIO_SALUDO)) {
      try {
        console.log('  📤 Enviando audio de saludo...');
        const audioBuffer = fs.readFileSync(AUDIO_SALUDO);
        await sock.sendMessage(from, {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        });
        console.log('  ✅ Audio enviado');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('  ❌ Error enviando audio:', error.message);
      }
    } else {
      console.log('  ⚠️ Audio no encontrado');
    }

    // 2️⃣ ENVIAR INSTRUCCIONES
    await sock.sendMessage(from, { text: PROYECTO.instrucciones });
    console.log('  ✅ Instrucciones enviadas');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3️⃣ ENVIAR VIDEO PARA ANDROID
    if (fs.existsSync(VIDEO_1)) {
      try {
        console.log('  📤 Enviando video Android...');
        const video1Buffer = fs.readFileSync(VIDEO_1);
        const video1Stats = fs.statSync(VIDEO_1);
        const video1SizeMB = (video1Stats.size / (1024 * 1024)).toFixed(2);
        
        console.log(`  📊 Tamaño: ${video1SizeMB} MB`);
        
        await sock.sendMessage(from, {
          video: video1Buffer,
          caption: 'Para Android',
          mimetype: 'video/mp4'
        });
        console.log('  ✅ Video Android enviado');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error('  ❌ Error enviando video Android:', error.message);
      }
    } else {
      console.log('  ⚠️ Video Android no encontrado');
    }

    // 4️⃣ ENVIAR VIDEO PARA IPHONE
    if (fs.existsSync(VIDEO_2)) {
      try {
        console.log('  📤 Enviando video iPhone...');
        const video2Buffer = fs.readFileSync(VIDEO_2);
        const video2Stats = fs.statSync(VIDEO_2);
        const video2SizeMB = (video2Stats.size / (1024 * 1024)).toFixed(2);
        
        console.log(`  📊 Tamaño: ${video2SizeMB} MB`);
        
        await sock.sendMessage(from, {
          video: video2Buffer,
          caption: 'Para iPhone',
          mimetype: 'video/mp4'
        });
        console.log('  ✅ Video iPhone enviado');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('  ❌ Error enviando video iPhone:', error.message);
      }
    } else {
      console.log('  ⚠️ Video iPhone no encontrado');
    }

    // 5️⃣ SOLICITAR PANTALLAZO
    const mensajeFinal = `Cuando tengas las redes escaneadas, envíame un pantallazo de las redes que te aparecen`;

    await sock.sendMessage(from, { text: mensajeFinal });
    console.log('  ✅ Solicitud de pantallazo enviada');

  } catch (error) {
    console.error('❌ Error enviando contenido:', error.message);
    
    try {
      await sock.sendMessage(from, { 
        text: '⚠️ Hubo un problema, intenta de nuevo más tarde' 
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
    proyecto: PROYECTO.nombre,
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
  console.log(`\n🔒 BOT DE WHATSAPP - AUDITORÍA WIFI 🔒`);
  console.log(`🌐 Panel de Control: http://localhost:${PORT}`);
  console.log(`📊 API Status: http://localhost:${PORT}/status`);
  console.log(`📚 Proyecto: ${PROYECTO.nombre}\n`);
  
  // Verificar archivos multimedia
  console.log('📁 Verificando archivos multimedia...');
  
  if (fs.existsSync(AUDIO_SALUDO)) {
    const sizeAudio = (fs.statSync(AUDIO_SALUDO).size / 1024).toFixed(2);
    console.log(`✅ saludo.ogg encontrado (${sizeAudio} KB)`);
  } else {
    console.log('❌ saludo.ogg NO encontrado - Crea carpeta "audios" y agrega el archivo');
  }
  
  if (fs.existsSync(VIDEO_1)) {
    const sizeVideo1 = (fs.statSync(VIDEO_1).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ video1.mp4 encontrado (${sizeVideo1} MB)`);
  } else {
    console.log('❌ video1.mp4 NO encontrado - Crea carpeta "videos" y agrega el archivo');
  }
  
  if (fs.existsSync(VIDEO_2)) {
    const sizeVideo2 = (fs.statSync(VIDEO_2).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ video2.mp4 encontrado (${sizeVideo2} MB)`);
  } else {
    console.log('❌ video2.mp4 NO encontrado - Crea carpeta "videos" y agrega el archivo');
  }
  
  console.log('\n⚡ CONFIGURACIÓN:');
  console.log('   • Respuesta automática: ACTIVADA');
  console.log('   • Orden de envío: Audio → Mensaje → Videos');
  console.log('   • Anti-duplicados: ACTIVADO 🔥');
  console.log('   • NO responde a mi propio número: ✅');
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