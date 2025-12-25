// Bot de WhatsApp para Outlet Tech Boyacá - iPhone Store
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
const COOLDOWN_MINUTOS = 60;
const COOLDOWN_MS = COOLDOWN_MINUTOS * 60 * 1000;

// Control de mensajes procesados y cooldowns
const mensajesProcesados = new Set();
const usuariosCooldown = new Map();
const estadoUsuarios = new Map();

// Limpiar mensajes antiguos cada 5 minutos
setInterval(() => {
  mensajesProcesados.clear();
  console.log('🧹 Cache de mensajes limpiado');
}, 300000);

// Información de OUTLET TECH BOYACÁ
const EMPRESA = {
  nombre: "Outlet Tech Boyacá",
  audioSaludo: "./audio/saludo-daniela.ogg",
  telefono: "305 2707907",
  direccion: "Calle 11a # 9-27, Tunja, Boyacá",
  ubicacionMaps: "https://maps.app.goo.gl/tGE9JvRz49DyYrAk7",
  metodoPago: "💳 *Formas de pago disponibles:*\n\n✅ Efectivo\n✅ Transferencia\n✅ Nequi\n✅ Daviplata\n✅ Tarjetas",
  whatsappAsesor: "317 6997474"
};

// 📱 CATÁLOGO DE IPHONES
const IPHONES = `📱 *Estos son los iPhones que tenemos:*

🔥 iPhone 13 128GB 
   Negro, Azul, Blanco, Rosa, Verde
   Batería +85%
   💰 $1.325.000

🔥 iPhone 13 256GB
   Negro, Azul, Blanco, Rosa, Verde
   Batería +85%
   💰 $1.399.990

🔥 iPhone 12 Pro 256GB
   Azul - Batería +90%
   💰 $1.449.990

🔥 iPhone 14 Pro 256GB
   Batería +85%
   💰 $2.149.990

🔥 iPhone 14 Pro Max 128GB
   Negro - Batería +85%
   💰 $2.449.990

🔥 iPhone 14 Pro Max 256GB
   Morado - Batería +85%
   💰 $2.599.990

🔥 iPhone 15 Pro 256GB + Cable tipo C
   Batería +85%
   💰 $2.699.990

🔥 iPhone 14 Pro Max 512GB
   Negro 89% | Morado 85-88%
   💰 $2.799.990

🔥 iPhone 15 Pro Max 256GB + Cable tipo C
   Blanco 84-87%
   💰 $2.999.990

🔥 iPhone 16 Pro 128GB + Cable tipo C
   Natural, Negro, Desert, Blanco
   Batería +90%
   💰 $2.999.990

🔥 iPhone 15 Pro Max 1TB + Cable tipo C
   Natural y Azul 81-88%
   💰 $3.349.990

🔥 iPhone 16 Pro 256GB + Cable tipo C
   Natural y Negro +90%
   💰 $3.399.990

🔥 iPhone 15 Pro Max 1TB + Cable tipo C
   Natural y Azul 90-95%
   💰 $3.399.990

✨ Todos en perfecto estado
📦 Entrega inmediata

Escribe el número del que te interesa o escribe *0* para volver al menú`;

// 🎯 MENÚ PRINCIPAL
const MENU_PRINCIPAL = `Soy Johana en que puedo ayudarte? 😊

1. Ver iPhones disponibles 📱
2. Ubicación de la tienda 📍
3. Formas de pago 💳
4. Hablar con un asesor 👤

Solo escribe el número`;

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
        
        const text = (msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '').trim();
        
        const telefono = from.split('@')[0];
        console.log(`\n📩 Mensaje de ${telefono}: ${text}`);

        await manejarMensaje(from, text, telefono);

      } catch (error) {
        console.error('❌ Error procesando mensaje:', error.message);
      }
    });
  } catch (error) {
    console.error('❌ Error en conexión:', error.message);
    isConnecting = false;
  }
}

// 🎯 MANEJAR MENSAJES Y MENÚ INTERACTIVO
async function manejarMensaje(from, text, telefono) {
  try {
    const estadoActual = estadoUsuarios.get(from) || 'inicial';
    
    console.log(`📊 Estado actual de ${telefono}: ${estadoActual}`);

    await sock.sendPresenceUpdate('composing', from);

    const esNuevoUsuario = !estadoUsuarios.has(from);
    const comandosInicio = ['hola', 'menu', 'inicio', 'ola', 'hi', 'hello', 'buenas'];
    const esComandoInicio = comandosInicio.some(cmd => text.toLowerCase().includes(cmd));
    const esOpcionMenu = ['1', '2', '3', '4', '0'].includes(text.trim());

    const minutosRestantes = estaEnCooldown(from);
    const estaEnMenuActivo = estadoActual === 'menu_principal' || estadoActual === 'viendo_iphones';
    
    // 🆕 Detectar si el usuario quiere reactivar el bot
    const esNumeroSolo = /^[0-9]+$/.test(text.trim());
    const comandosReactivar = ['menu', 'inicio', 'hola'];
    const quiereReactivar = esNumeroSolo || comandosReactivar.some(cmd => text.toLowerCase().includes(cmd));
    const estaEsperandoAsesor = estadoActual === 'esperando_asesor';

    // Si está en cooldown y NO está en menú activo y NO es comando de inicio
    // PERO: si está esperando asesor y quiere reactivar, SÍ debe responder
    if (minutosRestantes && !estaEnMenuActivo && !esComandoInicio && !(estaEsperandoAsesor && quiereReactivar)) {
      console.log(`⏳ Usuario en cooldown. Faltan ${minutosRestantes} minutos\n`);
      await sock.sendPresenceUpdate('paused', from);
      return;
    }

    // Si es nuevo usuario o comando de inicio
    if (esNuevoUsuario || esComandoInicio) {
      // 🎤 ENVIAR AUDIO DE DANIELA PRIMERO
      if (!minutosRestantes) {
        usuariosCooldown.set(from, Date.now());
      }
      
      estadoUsuarios.set(from, 'menu_principal');
      
      try {
        // Verificar si existe el audio OGG
        const rutaAudio = path.join(__dirname, 'audio', 'saludo-daniela.ogg');
        console.log(`🔍 Buscando audio en: ${rutaAudio}`);
        
        if (fs.existsSync(rutaAudio)) {
          const audioBuffer = fs.readFileSync(rutaAudio);
          
          await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          });
          
          console.log(`🎤 Audio de Daniela enviado a ${telefono}`);
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log('⚠️ Audio no encontrado en:', rutaAudio);
        }
      } catch (error) {
        console.error('❌ Error enviando audio:', error.message);
      }
      
      await sock.sendMessage(from, { text: MENU_PRINCIPAL });
      
      console.log(`✅ Menú principal enviado a ${telefono}`);
      await sock.sendPresenceUpdate('paused', from);
      return;
    }

    // PROCESAR OPCIONES DEL MENÚ
    if (estadoActual === 'menu_principal' && esOpcionMenu) {
      await procesarOpcionMenu(from, text, telefono);
    } else if (estadoActual === 'viendo_iphones') {
      if (text === '0') {
        estadoUsuarios.set(from, 'menu_principal');
        await sock.sendMessage(from, { text: MENU_PRINCIPAL });
        console.log(`✅ Usuario ${telefono} regresó al menú principal`);
      } else if (esOpcionMenu) {
        estadoUsuarios.set(from, 'menu_principal');
        await procesarOpcionMenu(from, text, telefono);
      } else {
        // 🆕 AQUÍ SE ACTIVA CUANDO ESCRIBE ALGO QUE NO ES NÚMERO
        estadoUsuarios.set(from, 'esperando_asesor');
        await sock.sendMessage(from, { 
          text: `Vale ya te respondo` 
        });
        console.log(`👤 Usuario ${telefono} será atendido por un asesor - Bot detenido`);
      }
    } else if (estadoActual === 'menu_principal') {
      // 🆕 Si está en el menú pero escribe TEXTO (no un número válido)
      // Detectar si tiene letras o palabras (romper el bucle)
      const tieneLetras = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(text);
      
      if (tieneLetras) {
        // ROMPER EL BUCLE - el usuario escribió algo humano
        estadoUsuarios.set(from, 'esperando_asesor');
        await sock.sendMessage(from, { 
          text: `Vale ya te respondo` 
        });
        console.log(`👤 Usuario ${telefono} escribió texto - Bot detenido para asesor humano`);
      } else {
        // Solo si escribió números raros que no son 1,2,3,4
        await sock.sendMessage(from, { 
          text: `⚠️ Por favor escribe *1*, *2*, *3* o *4* para elegir una opción:\n\n${MENU_PRINCIPAL}` 
        });
      }
    } else if (estadoActual === 'esperando_asesor') {
      // 🆕 BOT DETENIDO - Pero se reactiva si el usuario presiona un número
      const comandosReactivar = ['menu', 'inicio', 'hola'];
      const quiereMenu = comandosReactivar.some(cmd => text.toLowerCase().includes(cmd));
      const esNumeroSolo = /^[0-9]+$/.test(text.trim());
      
      if (quiereMenu || esNumeroSolo) {
        // Si escribe "menu", "hola" o CUALQUIER NÚMERO, reactiva el bot
        estadoUsuarios.set(from, 'menu_principal');
        await sock.sendMessage(from, { text: MENU_PRINCIPAL });
        console.log(`✅ Usuario ${telefono} reactivó el bot con: "${text}"`);
      } else {
        // Si escribe CUALQUIER otra cosa, el bot NO responde (se ve humano)
        console.log(`🤐 Bot silencioso para ${telefono} - Mensaje: "${text}" (esperando asesor humano)`);
        // NO enviar NADA - total silencio para que parezca humano
      }
    }

    await sock.sendPresenceUpdate('paused', from);

  } catch (error) {
    console.error('❌ Error manejando mensaje:', error.message);
  }
}

// 🎯 PROCESAR OPCIONES DEL MENÚ
async function procesarOpcionMenu(from, text, telefono) {
  try {
    const opcion = text.trim();

    switch(opcion) {
      case '1':
        estadoUsuarios.set(from, 'viendo_iphones');
        await sock.sendMessage(from, { text: IPHONES });
        console.log(`✅ Catálogo enviado a ${telefono}`);
        break;

      case '2':
        await sock.sendMessage(from, { 
          text: `📍 *Nuestra ubicación*\n\n${EMPRESA.direccion}\n\n⏰ *Horario*\nLunes a Sábado: 7:00 AM - 8:00 PM\nDomingos: 8:00 AM - 11:00 AM` 
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, {
          location: {
            degreesLatitude: 5.524566,
            degreesLongitude: -73.363801
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, { 
          text: `🗺️ También puedes verlo aquí:\n${EMPRESA.ubicacionMaps}` 
        });
        
        estadoUsuarios.set(from, 'menu_principal');
        console.log(`✅ Ubicación enviada a ${telefono}`);
        break;

      case '3':
        await sock.sendMessage(from, { 
          text: `${EMPRESA.metodoPago}\n\n✨ Pregunta por nuestros planes de financiación` 
        });
        estadoUsuarios.set(from, 'menu_principal');
        console.log(`✅ Métodos de pago enviados a ${telefono}`);
        break;

      case '4':
        await sock.sendMessage(from, { 
          text: `📞 *Hablar con un asesor*\n\n¡Con gusto te atendemos!\n\n💬 WhatsApp: ${EMPRESA.whatsappAsesor}\n☎️ Llámanos: ${EMPRESA.telefono}` 
        });
        estadoUsuarios.set(from, 'menu_principal');
        console.log(`✅ Info de contacto enviada a ${telefono}`);
        break;

      default:
        await sock.sendMessage(from, { 
          text: `⚠️ Opción no válida.\n\nPor favor escribe *1*, *2*, *3* o *4*:\n\n${MENU_PRINCIPAL}` 
        });
        break;
    }
  } catch (error) {
    console.error('❌ Error procesando opción:', error.message);
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
      puedeResponder: minutosRestantes === 0,
      estado: estadoUsuarios.get(telefono) || 'inicial'
    };
  });

  res.json({ 
    status: isConnected ? 'conectado' : 'desconectado',
    empresa: EMPRESA.nombre,
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
    estadoUsuarios.delete(telefono);
    console.log(`✅ Cooldown y estado eliminados para ${req.params.telefono}`);
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
  estadoUsuarios.clear();
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
  console.log(`\n📱 BOT DE WHATSAPP - OUTLET TECH BOYACÁ 🎯`);
  console.log(`🌐 Panel de Control: http://localhost:${PORT}`);
  console.log(`📊 API Status: http://localhost:${PORT}/status\n`);
  
  console.log('⚡ CONFIGURACIÓN:');
  console.log('   • 🎤 Audio de Daniela: ACTIVADO ✅ (OGG)');
  console.log('   • Menú interactivo: ACTIVADO ✅');
  console.log('   • Catálogo de iPhones: INCLUIDO ✅');
  console.log('   • 👤 Derivación a asesor: ACTIVADO ✅');
  console.log('   • Anti-duplicados: MEJORADO 🔥');
  console.log('   • NO responde a mi propio número: ✅');
  console.log(`   • ⏰ Cooldown: ${COOLDOWN_MINUTOS} minutos entre respuestas`);
  console.log('   • 🌐 Interfaz Web: ACTIVADA\n');
  
  const publicFolder = path.join(__dirname, 'public');
  if (!fs.existsSync(publicFolder)) {
    fs.mkdirSync(publicFolder);
    console.log('📁 Carpeta "public" creada\n');
  }
  
  const audioFolder = path.join(__dirname, 'audio');
  if (!fs.existsSync(audioFolder)) {
    fs.mkdirSync(audioFolder);
    console.log('📁 Carpeta "audio" creada - PON TU AUDIO AHÍ\n');
  }
  
  connectToWhatsApp();
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Error no manejado:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Excepción no capturada:', err.message);
});