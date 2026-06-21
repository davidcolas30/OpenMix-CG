/**
 * certService.ts — Generación de certificados TLS autofirmados.
 *
 * ¿Por qué necesitamos HTTPS?
 * Los navegadores móviles requieren un contexto seguro (HTTPS o localhost)
 * para acceder a la cámara y el micrófono via navigator.mediaDevices.getUserMedia().
 * Sin HTTPS, el navegador bloquea el acceso a la cámara.
 *
 * ¿Por qué autofirmado?
 * En modo Local Studio (misma red WiFi), no hay un dominio público para usar
 * Let's Encrypt. Generamos un certificado autofirmado al iniciar la app.
 * El móvil mostrará una advertencia de seguridad que el operador debe aceptar
 * una sola vez.
 *
 * Usamos la librería 'selfsigned' que genera certificados X.509 con
 * Subject Alternative Names (SANs) para la IP local del equipo.
 */

import selfsigned from 'selfsigned'
import { networkInterfaces } from 'os'

/** Resultado de la generación de certificado */
export interface TlsCert {
  /** Clave privada en formato PEM */
  key: string
  /** Certificado público en formato PEM */
  cert: string
}

/**
 * Obtiene todas las IPs locales del equipo (no-loopback, IPv4).
 *
 * Necesitamos las IPs para incluirlas como Subject Alternative Names (SANs)
 * en el certificado. Así el navegador móvil acepta el cert cuando accede
 * por la IP local (ej: https://192.168.1.5:9000/cam).
 */
function getLocalIps(): string[] {
  const ips: string[] = []
  const interfaces = networkInterfaces()

  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name]
    if (!entries) continue
    for (const entry of entries) {
      // Solo IPv4, no-loopback, no link-local (169.254.x.x)
      if (entry.family === 'IPv4' && !entry.internal) {
        ips.push(entry.address)
      }
    }
  }

  return ips
}

/**
 * Genera un certificado TLS autofirmado válido para localhost y las IPs locales.
 *
 * El certificado incluye SANs para:
 * - localhost
 * - 127.0.0.1
 * - Todas las IPs locales del equipo (WiFi, Ethernet, etc.)
 *
 * Válido por 1 día (suficiente para una sesión de producción).
 * Se regenera cada vez que la app se inicia.
 */
export async function generateSelfSignedCert(): Promise<TlsCert> {
  const localIps = getLocalIps()

  // Subject Alternative Names: el navegador valida el cert contra estos
  const altNames = [
    { type: 2 as const, value: 'localhost' }, // type 2 = DNS name
    { type: 7 as const, ip: '127.0.0.1' }, // type 7 = IP address
    ...localIps.map((ip) => ({ type: 7 as const, ip }))
  ]

  // Atributos del sujeto del certificado
  const attrs = [{ name: 'commonName', value: 'OpenMix-CG Local' }]

  const result = await selfsigned.generate(attrs, {
    keySize: 2048,
    notAfterDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 día de validez
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames
      }
    ]
  })

  console.log(
    `[CertService] Certificado TLS generado para: localhost, ${localIps.join(', ') || '(sin IPs locales)'}`
  )

  return {
    key: result.private,
    cert: result.cert
  }
}
