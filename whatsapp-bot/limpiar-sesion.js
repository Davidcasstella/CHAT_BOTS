// Script para limpiar sesión de WhatsApp
const fs = require('fs');
const path = require('path');

const authFolder = path.join(__dirname, 'auth_info');

console.log('\n🧹 LIMPIANDO SESIÓN DE WHATSAPP...\n');

if (fs.existsSync(authFolder)) {
  try {
    // Eliminar carpeta completa
    fs.rmSync(authFolder, { recursive: true, force: true });
    console.log('✅ Sesión eliminada correctamente');
    console.log('📱 Ahora puedes ejecutar el bot y escanear un nuevo QR\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Solución manual:');
    console.log('   1. Cierra el bot (Ctrl+C)');
    console.log('   2. Elimina la carpeta "auth_info"');
    console.log('   3. Ejecuta el bot de nuevo\n');
  }
} else {
  console.log('⚠️  No hay sesión activa para limpiar\n');
}