# Por qué está hecho así

Notas de las decisiones que no se explican solas leyendo el código.

## Sin framework y sin build

La app son archivos estáticos que el navegador carga como módulos de ES. No hay
bundler, ni transpilador, ni `npm install` para publicar.

La razón no es purismo. Es que esta app la van a usar dos personas durante
años y en algún momento va a haber que tocarle algo. Con cada herramienta de
build que se agrega, ese "tocarle algo" pasa a depender de que la versión de
Node siga andando, de que el bundler siga existiendo y de que las dependencias
no se hayan podrido. Sin build, abrir el archivo y editarlo sigue funcionando
para siempre.

El costo es real: sin tipos, sin tree shaking, sin minificar. A esta escala —
unos pocos miles de líneas y dos usuarios — no se nota.

Las dos dependencias de afuera son `supabase-js` (CDN) y las tipografías. Las
dos las cachea el service worker.

Los iconos no son una dependencia: están dibujados a mano en
`js/lib/iconos.js`, como listas de paths sobre una grilla de 24. Es más trabajo
que traer una librería de iconos, pero son unos treinta dibujos que no van a
cambiar y evitan una descarga más y una versión más que mantener. Tampoco son
emoji: el emoji lo dibuja el sistema operativo, así que el mismo icono se ve
distinto en cada teléfono y ninguno se parece al resto de la app.

## El color de cada integrante se guarda una sola vez

En `ag_personas` va el tinte y nada más. El fondo suave de una fila y el color
del texto que va encima los calcula el CSS con `color-mix` a partir de ese
tinte, y los calcula distinto según el tema:

```css
[style*='--tinte'] {
  --tinte-fondo: color-mix(in srgb, var(--tinte) 13%, var(--superficie));
  --tinte-texto: var(--tinte);
}
:root[data-tema='oscuro'] [style*='--tinte'] {
  --tinte-fondo: color-mix(in srgb, var(--tinte) 24%, var(--superficie));
  --tinte-texto: color-mix(in srgb, var(--tinte) 45%, #ffffff);
}
```

Si el fondo y el texto se guardaran en la base junto al tinte, habría que elegir
para qué tema: el mismo verde pastel que se lee sobre marfil es ilegible sobre
negro. Guardando uno solo, el mismo dato sirve para los dos, y cambiar la paleta
es cambiar una lista en `js/data/paleta.js`.

**Ojo con una trampa de JavaScript:** una variable CSS no se puede asignar con
`Object.assign(nodo.style, { '--tinte': color })`. No falla, no avisa: la
ignora. Hay que usar `setProperty`, y por eso `el()` en `js/lib/ui.js` trata
aparte las claves que empiezan con `--`. Esto ya se rompió una vez y el síntoma
fue que todos los integrantes se veían del mismo gris.

## Una tabla que falta se lleva puesta su sección, no la app

La app se instala una vez y después se le agregan cosas. Cuando se sumó
`ag_tareas`, cualquiera que no volviera a correr el `schema.sql` tenía esa tabla
faltando en su proyecto — y el `Promise.all` de `cargarTodo()` convertía ese
único error en una pantalla de "No se pudieron traer los datos": ni agenda, ni
menú, ni nada.

Ahora las secciones se cargan con `opcional()`, que se traga **un solo** tipo de
error: "esa tabla no existe" (PGRST205 de PostgREST, 42P01 de Postgres). La
sección queda vacía, se anota el nombre de la tabla, y esa pantalla muestra qué
hay que correr. Cualquier otro error —sin permiso, sin red, sesión vencida—
sigue de largo y frena la carga, porque esos sí hay que verlos.

Lo que **no** es opcional: el hogar, las personas y los eventos. Sin esas tablas
no hay app y la pantalla de error es la respuesta correcta.

## Las horas viven en Buenos Aires

Decisión: los horarios se muestran y se guardan en hora de Buenos Aires,
independientemente de la zona del dispositivo.

Si estás de viaje en Madrid y abrís la agenda, querés ver "natación 19:00",
porque es la hora a la que tu hijo va a natación. No querés ver "natación
00:00" traducido a hora de Madrid.

Implementación (`js/lib/fechas.js`):

- **mostrar**: `Intl.DateTimeFormat` con `timeZone` fijo.
- **guardar**: se arma el ISO con el offset `-03:00` escrito a mano.

Se puede escribir el offset fijo porque Argentina no usa horario de verano desde
2009. Si volviera, hay que cambiar `OFFSET` y la forma de armar el ISO en
`combinarFechaHora()`; el resto del archivo no se entera.

Las cuentas de días se hacen sobre fechas `YYYY-MM-DD`, nunca sobre objetos
`Date`. Un `Date` arrastra hora y zona, y ahí es donde aparecen los días
corridos.

## La app y el celular tienen que ver lo mismo

Un evento que se repite se expande dos veces, en dos lugares distintos:

1. **En la app**, con `ocurrencias()` de `js/lib/fechas.js`, para dibujar el
   calendario.
2. **En el celular**, por el cliente de calendario, a partir del `RRULE` que
   arma `supabase/functions/_shared/ics-build.ts`.

Si las dos expansiones no coinciden, la app muestra una cosa y el calendario
otra. En una agenda compartida eso es peor que no tener la función.

Por eso hay una prueba (`js/lib/fechas.test.js`) que corre las dos expansiones
sobre trece casos y las compara, usando ICAL.js como cliente de calendario. Esa
prueba encontró dos bugs reales durante el desarrollo:

- una comparación de rango invertida que vaciaba todas las series;
- que un cumpleaños el 29 de febrero la app lo salteaba en los años no
  bisiestos mientras ICAL.js lo corría al 1 de marzo.

El segundo se arregló haciendo el `RRULE` explícito
(`FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29`) en vez de confiar en que cada cliente
resuelva igual una fecha que no existe.

**Si tocás una de las dos expansiones, tocá la otra y corré esa prueba.**

## Las notificaciones son propias, y el .ics quedó como extra

Durante un tiempo la única forma de que la app avisara fue publicar la agenda
como calendario y dejar que el recordatorio lo diera el teléfono. Funcionaba,
pero el aviso era de otra app: su ícono, su formato, y uno por evento.

Ahora los avisos son de juntos. Lo que eso permite, y un calendario no:

- **Agrupar.** Un aviso por momento en vez de uno por cosa.
- **Decidir qué es lo importante.** El título lleva lo que roza —una tarea
  vencida le gana a tres eventos—, no el orden cronológico.
- **Cruzar datos.** "Hay algo a las 19 y no hay cena pensada" sale de la agenda
  y del menú a la vez. Ningún calendario puede saber eso.
- **Callarse.** Si el día no tiene nada, no interrumpe. Un aviso que a veces
  dice "no hay nada" enseña a ignorarlo.

El texto vive en `_shared/avisos-texto.ts`, aparte de todo lo demás, y es
función pura: entra el día ya resuelto y sale el aviso. Por eso se puede probar
el texto como se prueba cualquier función, en vez de mirarlo en un teléfono.

### Web Push escrito a mano

`_shared/webpush.ts` implementa el cifrado (RFC 8291) y la firma VAPID (RFC
8292) con Web Crypto, sin librerías. Dos razones: las librerías de web push son
de Node y usan su módulo `crypto`, que en el runtime de Supabase no está
garantizado; y es una dependencia menos que se puede pudrir en un proyecto que
tiene que seguir andando en tres años.

El riesgo de escribir criptografía a mano es que un error no se nota: el
servicio de push acepta el pedido, devuelve 201, y el celular simplemente no
muestra nada. Por eso la prueba lo corre contra el vector del RFC 8291 §5
—mismas claves, misma sal— y compara el cuerpo cifrado byte por byte contra lo
que dice el documento.

### Cómo se dispara sin servidor

`pg_cron` llama a la función cada hora desde adentro del mismo proyecto, con
`pg_net`. No hay servicio de afuera ni claves pegadas en ningún lado: el cuerpo
del cron lee la URL y el token de `ag_avisos_config` en cada corrida, y la app
completa esa URL sola la primera vez que alguien prende los avisos.

Las claves VAPID se generan solas la primera vez y viven en `ag_vapid`, que
tiene RLS prendida y **ninguna política**. Esa ausencia es la protección: sin
políticas, el cliente no la lee ni con la clave publishable; solo las funciones,
que entran con la clave de servicio y saltean RLS.

## Por qué el feed .ics fue primero, y por qué no alcanzó

Al principio los avisos iban solo por el calendario. Las razones para descartar
push eran tres, y conviene anotar cuáles resultaron ciertas:

- **"Push necesita un servidor corriendo todo el tiempo."** Falso, y era la
  razón principal. `pg_cron` vive adentro del mismo proyecto de Supabase: no
  hay un proceso más que mantener ni una cuenta más que pagar.
- **"En iPhone Web Push solo anda con la PWA instalada."** Cierto, y sigue
  siéndolo. Por eso la pantalla de avisos detecta cuándo el navegador no puede
  y lo explica, en vez de mostrar un botón que no va a funcionar.
- **"Una notificación push es una cosa más que mirar."** Esta era la más
  discutible, y terminó siendo al revés. El calendario avisa una vez por
  evento, siempre igual, y avisa aunque no haya nada que decidir: eso sí es una
  cosa más que mirar. Un aviso por momento, que se calla cuando no hay nada, es
  menos ruido, no más.

El feed `.ics` quedó igual, pero para otra cosa: ver la agenda mezclada con el
resto de los compromisos de cada uno. Para eso el calendario del sistema sigue
siendo mejor que cualquier pantalla que podamos hacer.

Su límite conocido: los calendarios suscritos se refrescan cuando el cliente
quiere, y Google puede tardar horas. Para algo de hoy mismo está el botón
"agregar al calendario" de cada evento, que baja un `.ics` de un solo evento y
entra al instante.

## Seguridad

**RLS de verdad, no por convención.** Cada tabla tiene una política que exige
ser miembro del hogar. Las funciones de membresía son `security definer` para no
entrar en recursión al consultarse a sí mismas. `supabase/tests/test_rls.sql`
corre sobre un Postgres real y verifica, tabla por tabla, que alguien de afuera
no vea ni escriba nada. Cada tabla nueva suma su propio bloque ahí: una tabla
sin prueba de RLS es una tabla que nadie verificó.

**El alta de hogar va por una función, no por un insert.** Si `ag_hogares`
aceptara inserts sueltos, se podría crear un hogar sin personas: un hogar
huérfano al que nadie puede entrar ni borrar. `ag_crear_hogar()` crea las dos
cosas juntas.

**Nadie puede echar a nadie por la ventana.** La política de update de
`ag_personas` solo deja tocar la propia fila o la de alguien sin cuenta. Sin esa
restricción, un miembro podría dejar en `null` el `user_id` de otro y sacarlo
del hogar sin que se entere.

**El proxy de calendarios no es un proxy abierto.** `ics-proxy` baja una URL
arbitraria desde adentro de la infraestructura de Supabase, que es un agujero de
SSRF de manual: `http://169.254.169.254/` devuelve credenciales de la nube. El
filtro de `_shared/url-segura.ts` rechaza protocolos que no sean http/https,
nombres y rangos de red internos, resuelve el DNS para atajar un dominio público
que apunte a una IP privada, y sigue los redirects a mano revalidando cada
salto. Hay 23 casos probados.

**Nada de la base se convierte en HTML.** Todo lo que escribió una persona entra
por `textContent`. Lo único que pasa por `innerHTML` es lo que devuelve el
modelo, y antes se escapa entero y recién después se le agregan las etiquetas de
negrita. Dos pruebas de navegador lo verifican intentando ejecutar código.

## Una sola fuente para la estacionalidad

`js/data/temporada.js` es la única tabla de qué está de temporada. La función
`chef-ia` **no tiene su propia copia**: la recibe como contexto en cada pedido.

Si la función tuviera la suya, en algún momento alguien corrige un mes en una de
las dos y no en la otra, y la app empieza a decir una cosa mientras el agente
recomienda otra. Con una sola tabla eso no puede pasar.

La tabla separa tres cosas: lo que está de temporada, lo que no tiene temporada
(despensa, lácteos, carne) y lo que está fuera de temporada. Sin esa separación,
unas berenjenas con aceite de oliva y vinagre puntuaban 40% "de temporada" en
pleno febrero, que es justo cuando la berenjena está en su mejor momento.

## Lo que el agente nunca decide solo

El agente propone; las personas deciden. El menú que devuelve se muestra en una
lista donde se puede sacar lo que no gusta, y recién ahí se guarda. Nunca se
escribe en el planificador sin que lo hayan visto.

Y todo lo que devuelve pasa por `_shared/menu-sanear.ts` antes de tocar la base:
se descartan las fechas que no existen, los momentos inventados, dos comidas
para el mismo día y momento (que reventaría la clave única de `ag_menu`), los
rubros que la lista de compras no conoce y los tiempos absurdos. El modelo casi
siempre responde bien; "casi siempre" no alcanza cuando lo que sigue es un
insert.
