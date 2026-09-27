// Pruebas del filtro anti-SSRF del proxy de calendarios.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { validarUrlPublica } from './url-segura.ts';

const RECHAZAR = [
  ['http://localhost/cal.ics', 'localhost'],
  ['http://localhost:8000/cal.ics', 'localhost con puerto'],
  ['http://127.0.0.1/cal.ics', 'loopback'],
  ['http://127.1.2.3/cal.ics', 'todo el 127/8 es loopback'],
  ['http://0.0.0.0/cal.ics', 'sin especificar'],
  ['http://10.0.0.5/cal.ics', 'red privada 10/8'],
  ['http://192.168.1.10/cal.ics', 'red privada 192.168/16'],
  ['http://172.16.0.1/cal.ics', 'red privada 172.16/12'],
  ['http://172.31.255.254/cal.ics', 'borde alto de 172.16/12'],
  ['http://169.254.169.254/latest/meta-data/', 'metadata de la nube'],
  ['http://100.64.0.1/cal.ics', 'CGNAT'],
  ['http://[::1]/cal.ics', 'loopback IPv6'],
  ['http://[fe80::1]/cal.ics', 'link-local IPv6'],
  ['http://[fd00::1]/cal.ics', 'unique local IPv6'],
  ['http://[::ffff:127.0.0.1]/cal.ics', 'IPv4 loopback mapeada en IPv6'],
  ['http://servidor.local/cal.ics', 'dominio .local'],
  ['http://api.internal/cal.ics', 'dominio .internal'],
  ['http://metadata.google.internal/', 'metadata de Google'],
  ['file:///etc/passwd', 'file://'],
  ['gopher://algo/', 'protocolo raro'],
  ['data:text/calendar,BEGIN:VCALENDAR', 'data:'],
  ['no es una url', 'texto suelto'],
  ['', 'vacio'],
] as const;

for (const [url, motivo] of RECHAZAR) {
  Deno.test(`rechaza ${motivo}: ${url || '(vacío)'}`, async () => {
    const v = await validarUrlPublica(url);
    assertEquals(v.ok, false, `deberia rechazar ${url}`);
    assert(v.motivo && v.motivo.length > 0, 'tiene que explicar por qué');
  });
}

Deno.test('acepta una URL pública normal', async () => {
  const v = await validarUrlPublica('https://calendar.google.com/calendar/ical/x/basic.ics');
  assertEquals(v.ok, true, v.motivo);
  assertEquals(v.url?.hostname, 'calendar.google.com');
});

Deno.test('webcal:// se traduce a https://', async () => {
  const v = await validarUrlPublica('webcal://p01.calendar.yahoo.com/cal.ics');
  assertEquals(v.ok, true, v.motivo);
  assertEquals(v.url?.protocol, 'https:');
  assertEquals(v.url?.hostname, 'p01.calendar.yahoo.com');
});

Deno.test('acepta http normal (muchos colegios no tienen TLS)', async () => {
  const v = await validarUrlPublica('http://ejemplo.com.ar/calendario.ics');
  assertEquals(v.ok, true, v.motivo);
});

Deno.test('no se cuelga de las mayusculas ni de los espacios', async () => {
  const v = await validarUrlPublica('  WEBCAL://Ejemplo.COM.ar/cal.ics  ');
  assertEquals(v.ok, true, v.motivo);
  assertEquals(v.url?.hostname, 'ejemplo.com.ar');
});
