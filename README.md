<p align="center">
  <img src="icons/trebol.svg" width="72" alt="">
</p>

<h1 align="center">juntos</h1>

<p align="center">
La agenda de la familia, el menú de la semana y lo que hay que hacer, en un solo
lugar.
</p>

Hecha para dos personas que comparten una casa y un hijo, y que se olvidan las
cosas. Corre en el celular como app (PWA), se sirve gratis desde GitHub Pages y
guarda todo en Supabase. No usa Vercel ni ningún otro servicio.

**→ [nachoxsm.github.io/nuestra-agenda](https://nachoxsm.github.io/nuestra-agenda/)**

La app se llama *juntos*; el repositorio y la dirección siguen diciendo
`nuestra-agenda` porque renombrarlos cambiaría el link que ya está guardado en
los teléfonos.

<p align="center">
  <img src="docs/capturas/claro-inicio.png" width="24%" alt="Inicio">
  <img src="docs/capturas/claro-agenda.png" width="24%" alt="Agenda del mes">
  <img src="docs/capturas/claro-agenda-semana.png" width="24%" alt="Agenda de la semana">
  <img src="docs/capturas/claro-tareas.png" width="24%" alt="Tareas de la casa">
</p>

---

## Qué hace

**Agenda compartida, en tres alturas.** Los eventos se cargan una vez y los ven
los dos, al instante. Cada uno tiene su color; los chicos también, aunque no
tengan cuenta. Se pueden repetir (todos los días, semanal por días elegidos,
cada 15, mensual, anual) y una vez puntual se puede cancelar sin romper la
serie.

Se mira de tres formas, con el control de arriba:

- **Mes** — el calendario completo, y en cada día los eventos **escritos**, con
  el color de quien los tiene. No hay que tocar un día para enterarse de que el
  martes hay natación.
- **Semana** — los siete días abiertos, uno abajo del otro, con todo lo que
  tiene cada uno y qué se come ese día.
- **Día** — un día entero con las horas a la izquierda, más las comidas y las
  tareas que vencen.

Y arriba de todo, un filtro por integrante: con tres personas cargadas el mes se
llena, y poder ver solo lo del nene es media agenda.

**Tareas de la casa.** Lo que hay que hacer pero no tiene hora: pagar el gas,
comprar el regalo, sacar la ropa de invierno. Se reparten entre los integrantes,
se tildan, y las que se repiten dejan sola la de la próxima vuelta. Arriba, cómo
viene la semana: el porcentaje hecho y una barrita por persona.

**Avisos propios, no los del calendario.** Esta es la parte que resuelve el "me
olvido". La app manda sus propias notificaciones: una a la mañana con el día y
otra los lunes con la semana.

Lo que las hace distintas de un recordatorio de calendario:

- **Una por momento, no una por cosa.** Cinco eventos no son cinco pings.
- **El título dice lo que roza, no lo que hay.** "19:00 Natación y 2 cosas más"
  arriba, y adentro "Se hace tarde y no hay cena pensada" — que es una
  conclusión de dos datos separados, no un renglón de una agenda.
- **Si no hay nada, no avisa.** Un aviso diario que a veces dice "no tenés nada"
  se vuelve ruido y se apaga a la semana.
- **Botones que abren donde hay que ir**, con el trébol y los colores de la app.

Y además, si se quiere, la agenda se puede publicar como calendario `.ics`
suscribible para verla mezclada con el resto de las cosas del teléfono.

**Menú semanal.** Un planificador de almuerzo y cena para los siete días, con un
recetario de comida de casa argentina. Cada comida guarda sus ingredientes.

**Lista de compras.** Sale de los ingredientes del menú con un toque, junta lo
repetido y queda agrupada por comercio: verdulería, carnicería, almacén. Cada
cosa dice de qué plato salió, así se puede decidir si hace falta de verdad.

**Un agente que sabe de temporada.** Propone el menú de la semana completo, o
contesta preguntas sueltas. Lo que lo hace distinto de preguntarle a un chatbot
cualquiera es el contexto que recibe:

- la lista real de lo que está de temporada **este mes en Buenos Aires**, así no
  propone tomate en julio;
- las restricciones y los gustos de la casa;
- lo que comieron las últimas dos semanas, para no repetir;
- **la agenda de esos días**. Si el martes hay natación a las 19, propone algo
  de veinte minutos, no un guiso de tres horas.

Lo que propone se revisa antes de cargarlo: se ve la lista, se saca lo que no
gusta, y recién ahí entra al planificador.

**Importar calendarios.** El del colegio, el del club, el de Google. Se pega el
link `.ics` o se sube el archivo. Resincronizar actualiza, no duplica.

### Sobre Cokidoo

Cokidoo no tiene API pública ni documentación para desarrolladores, así que no
hay forma de conectarse directo. Lo que sí funciona es el importador de
calendarios: si Cokidoo exporta un `.ics` o da un link de suscripción, entra por
ahí igual que el del colegio. Si en algún momento publican una API, el lugar
donde engancharla es `js/lib/ics.js` más una función nueva en
`supabase/functions/`.

---

## Cómo se instala

Está todo paso a paso en **[SETUP.md](SETUP.md)**. Son unos 15 minutos: crear el
proyecto de Supabase, pegar un SQL, cargar dos claves y prender GitHub Pages.

---

## Cómo está hecho

Sin framework y sin paso de build. Son archivos estáticos que el navegador
carga como módulos de ES. La razón es que el objetivo era que ustedes dos puedan
usarlo sin depender de nada más que las cuentas que ya tienen, y cada
herramienta de build agregada es una cosa más que se puede romper en dos años
cuando haya que tocar algo.

```
index.html                  la cáscara
config.js                   la URL y la clave de Supabase
css/app.css                 los estilos, tema claro y oscuro
js/
  main.js                   arranque y ruteo
  estado.js                 el estado compartido y el tiempo real
  lib/
    db.js                   todo lo que habla con Supabase
    fechas.js               fechas y repeticiones, en hora de Buenos Aires
    ics.js                  leer y escribir calendarios .ics
    ui.js                   armar nodos, avisos, hojas emergentes
    iconos.js               los iconos, dibujados a mano en SVG
  data/
    temporada.js            qué hay de temporada mes a mes en Buenos Aires
    recetas.js              el recetario base
    categorias.js           las categorías de evento
    paleta.js               los colores de los integrantes
  views/
    inicio.js               cómo viene el día
    agenda.js               mes, semana, día y el editor de eventos
    comidas.js              menú de la semana y lista de compras
    tareas.js               las tareas de la casa
    familia.js              integrantes, avisos y ajustes
    chef.js                 el agente
    entrar.js               configuración, cuenta y hogar
supabase/
  schema.sql                tablas, RLS y funciones
  functions/
    chef-ia/                el agente
    ics-proxy/              bajar calendarios de afuera (CORS)
    ics-feed/               publicar la agenda como calendario
    avisos/                 las notificaciones propias, cada hora
    _shared/webpush.ts      Web Push a mano, con Web Crypto
    _shared/avisos-texto.ts cómo se redacta cada aviso
  tests/                    pruebas del esquema sobre un Postgres real
pruebas/                    pruebas de la interfaz en un navegador real
```

### La identidad

El sistema visual sale del manual de *juntos*: superficies planas sobre marfil,
bordes de 1 px en lugar de sombras, radios generosos y áreas táctiles de 44 px
como mínimo. El terracota se usa solo para lo de hoy y lo urgente; si estuviera
en todos lados, dejaría de avisar nada.

**La app abre en claro, siempre.** No mira la preferencia del sistema: el marfil
es la identidad, no una de dos opciones equivalentes, y así se ve igual en los
dos teléfonos. El oscuro está a un toque, con el botón de la cabecera, y lo que
se elija queda guardado.

El símbolo son cuatro hojas, una de cada color, y un tallo terracota que las
sostiene: cada integrante tiene su lugar y algo en común los une.

El `icons/trebol.svg` **no está dibujado a mano**: son los contornos de la
imagen original de la marca (`docs/marca/identidad.webp`), sacados con potrace
—el mismo trazador que usa Inkscape— separando la imagen por color. La parte
delicada fue el antialias: clasificar cada píxel por el color más parecido deja
un anillo de píxeles intermedios alrededor de cada hoja, y esos anillos caen en
la capa equivocada. Se resuelve conservando solo la mancha conectada más grande
de cada color, porque cada hoja es una sola. Todo eso está en
`pruebas/trazar-logo.mjs`, que se puede volver a correr si el original cambia.

Los iconos están dibujados a mano en `js/lib/iconos.js` y no son emoji: el emoji
lo dibuja el sistema, así que en un Android se ve de una forma, en un iPhone de
otra, y ninguna de las dos se parece al resto de la app.

### Decisiones que vale la pena conocer

**Las horas viven en Buenos Aires, no en el dispositivo.** Para mostrar se
formatea con `Intl` fijando la zona; para guardar se escribe el offset `-03:00` a
mano. Si abrís la app de viaje ves "natación 19:00", que es lo que querés ver, y
no la hora que sería allá. Está todo en `js/lib/fechas.js`, con un comentario de
qué cambiar si Argentina volviera a usar horario de verano.

**La app y el calendario del celular tienen que coincidir siempre.** La app
expande las repeticiones por su cuenta para dibujar el calendario, y el feed
`.ics` las manda como `RRULE` para que las expande el teléfono. Si las dos
expansiones no dan lo mismo, ves una cosa en la app y otra en el celular, que es
el peor error posible en una agenda. Hay una prueba que compara las dos
expansiones usando ICAL.js como juez, sobre trece casos.

**El RRULE lleva el día y el mes escritos.** Sin eso, cada cliente de calendario
decide por su cuenta qué hacer con una fecha que no existe: para un cumpleaños
el 29 de febrero, unos lo saltean y otros lo corren al 1 de marzo.

**Una sola fuente para la estacionalidad.** La tabla está en
`js/data/temporada.js` y viaja como contexto en cada pedido al agente. La función
no tiene su propia copia, justamente para que no se desincronicen.

**El color de cada integrante se guarda una sola vez.** En la base va el tinte y
nada más; el fondo suave y el color de texto los calcula el CSS con `color-mix`
a partir de ese tinte. Si se guardaran los dos, el mismo verde pastel que se lee
sobre marfil quedaría ilegible en el tema oscuro.

**Nada de la base se convierte en HTML.** Todo lo que escribió una persona entra
por `textContent`. Lo que devuelve el modelo se escapa primero y recién después
se le agrega el negrita. Hay dos pruebas que lo verifican.

---

## Las pruebas

Tres capas, todas corren sin servicios de afuera: ni Supabase, ni claves de API,
ni red. También corren solas en cada push (`.github/workflows/pruebas.yml`).

```bash
# el esquema, el RLS y la convivencia con otra app en el mismo proyecto,
# todo contra un Postgres de verdad
./supabase/tests/run.sh

# 179 pruebas: las funciones y las librerías del frontend
deno task test

# 31 pruebas: la interfaz entera, en un Chromium de verdad
node pruebas/app.test.mjs

# y, de paso, las capturas de este README
node pruebas/capturas.mjs
```

Lo que cubren:

- que un hogar no vea absolutamente nada del otro (RLS, sobre Postgres);
- que instalar el esquema sobre un proyecto de Supabase que ya tiene otra app
  no le toque ni un objeto ni un dato — se arma una app ajena entera, se le
  corre el `schema.sql` encima y se compara todo;
- que el `.ics` que se publica sea válido, verificado con ICAL.js en vez de
  comparando texto — un `.ics` mal armado no da error, simplemente el celular no
  muestra nada;
- que el parser entienda lo que escriben Google y Outlook de verdad, incluida la
  zona `Romance Standard Time`, que no es IANA;
- que el proxy de calendarios no se deje usar para leer direcciones internas
  (SSRF): 23 casos, desde `127.0.0.1` hasta `169.254.169.254`;
- que la app abra y se navegue entera sin un solo error de JavaScript;
- que lo que se escribe en un campo no se ejecute.

---

## Qué no hace

- **No manda notificaciones push.** A propósito: el feed `.ics` hace el trabajo
  mejor y sin servidor propio. Lo que sí se pierde es el aviso instantáneo
  cuando el otro carga algo: los calendarios suscritos se actualizan cada varias
  horas. Para algo de hoy mismo está el botón "agregar al calendario" del evento.
- **No sincroniza calendarios importados sola.** Hay que tocar el botón de
  resincronizar. Se podría automatizar con `pg_cron` en Supabase.
- **No hay app nativa.** Es una PWA: se instala desde el navegador con "Agregar a
  la pantalla de inicio".

---

<p align="center">
  <img src="docs/capturas/claro-compras.png" width="24%" alt="Lista de compras por comercio">
  <img src="docs/capturas/claro-comidas.png" width="24%" alt="Menú de la semana">
  <img src="docs/capturas/claro-avisos.png" width="24%" alt="Avisos de la app">
  <img src="docs/capturas/oscuro-inicio.png" width="24%" alt="Inicio, tema oscuro">
</p>
