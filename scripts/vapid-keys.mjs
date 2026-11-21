// Genera las claves VAPID para los avisos push. Ejecutar en tu computadora:  node scripts/vapid-keys.mjs
// Copia cada valor en Vercel (Settings → Environment Variables). La clave PRIVADA no se comparte con nadie.
import crypto from 'node:crypto';
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
console.log('VAPID_PUBLIC_KEY=' + ecdh.getPublicKey().toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + ecdh.getPrivateKey().toString('base64url'));
console.log('VAPID_SUBJECT=mailto:soporte@veltrixsystem.app');
