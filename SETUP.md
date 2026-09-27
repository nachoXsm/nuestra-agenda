# Poner a andar Nuestra Agenda

Unos 15 minutos. No hace falta instalar nada en la computadora: se hace todo
desde el navegador, con las cuentas de GitHub y Supabase que ya tenés.

---

## 1. El proyecto de Supabase

Hay dos caminos. **El primero es el recomendado**, sobre todo si ya usás
Supabase para otra cosa.

### Opción A: reusar un proyecto que ya tengas

El plan gratuito permite **2 proyectos activos por persona**, así que es muy
probable que no puedas crear uno nuevo. No hace falta: todo lo de esta app vive
con el prefijo `ag_` justamente para poder convivir con otra en el mismo
proyecto.

Si vas a reusar el proyecto de **Nuestras Finanzas**, no hay un solo choque:

| | Nuestras Finanzas | Nuestra Agenda |
|---|---|---|
| Tablas | `grupos`, `gastos`, `ingresos`, `tarjetas` | `ag_*` (diez tablas) |
| Funciones SQL | — | `ag_*` |
| Edge Functions | `ai-advisor`, `send-invite` | `chef-ia`, `ics-proxy`, `ics-feed` |

Y el `GROQ_KEY` que usa el asesor de Finanzas es el mismo que necesita el chef,
así que **el paso 5 ya está hecho**.

Lo único que comparten de verdad es el espacio en disco y las cuotas del plan
gratuito. Una agenda familiar ocupa unos pocos megabytes por año, así que no es
un problema.

> **Supabase te va a avisar que el script tiene operaciones destructivas.** Es
> verdad que las tiene: son varios `drop ... if exists`, y todos apuntan a
> objetos `ag_*` que el mismo script crea. No hay ni un `drop table`, ni un
> `truncate`, ni un `delete` sobre nada ajeno.
>
> No hace falta que me creas: hay una prueba que lo verifica.
> `supabase/tests/test_convivencia.sql` arma una app ajena completa —tablas,
> datos, índices, triggers, políticas, vistas y funciones—, le corre el
> `schema.sql` por encima dos veces, y compara objeto por objeto y dato por
> dato. Si algo se moviera, falla. Corre en cada push.

### Opción B: un proyecto nuevo

Si tenés lugar:

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Nombre: `nuestra-agenda`. Región: **South America (São Paulo)**, la más cerca.
3. Guardá la contraseña de la base que te muestra.
4. Esperá un par de minutos a que termine de levantarse.

Si te aparece *"The organization has members who have exceeded their free
project limits"*, es el límite de 2 proyectos. Andá a la opción A, o pausá uno
de los proyectos que ya tenés.

---

## 2. Crear las tablas

1. En el proyecto, andá a **SQL Editor** → **New query**.
2. Abrí [`supabase/schema.sql`](supabase/schema.sql) de este repo, copiá **todo**
   y pegalo.
3. **Run**.

Tiene que decir *Success*. Van a aparecer avisos tipo `NOTICE: ... does not
exist, skipping`: son normales, el script está escrito para poder correrse de
nuevo sin romper nada.

### Comprobar que quedó bien

Pegá [`supabase/verificar.sql`](supabase/verificar.sql) en el SQL Editor y dale
Run. Es solo de lectura y te devuelve seis filas: las tablas, la seguridad, las
políticas, las funciones, y que Nuestras Finanzas siga entera con sus datos.
Todo tiene que dar ✅.

Esto crea las tablas, las políticas de seguridad (cada hogar solo ve lo suyo) y
las funciones que usa la app.

---

## 3. Configurar el ingreso

En **Authentication** → **Sign In / Providers**:

- **Email** tiene que estar prendido.
- Apagá **Confirm email**. Sin apagarlo, Supabase manda un mail de confirmación
  y su servidor de prueba tiene un límite muy bajo de envíos, así que lo más
  probable es que no llegue. Como el hogar se comparte con un código y no por
  mail, la confirmación no aporta nada acá.

> **Cuando los dos ya tengan cuenta, volvé y apagá el registro.** En
> **Authentication** → **Sign In / Providers** → **Allow new users to sign up**,
> en off. Desde ese momento nadie más puede crearse una cuenta en tu proyecto.
> Esto es lo que conviene hacer, porque la clave pública viaja en el código de
> la app y cualquiera que la vea podría registrarse (no vería tus datos, por el
> RLS, pero ocuparía lugar y sería ruido).

---

## 4. Subir las funciones

Son tres, y cada una está preparada como **un solo archivo** para que subirlas
desde el navegador sea una pegada por función:

| Función      | Qué pegar                                          |
|--------------|----------------------------------------------------|
| `chef-ia`    | `supabase/funciones-para-pegar/chef-ia.ts`         |
| `ics-proxy`  | `supabase/funciones-para-pegar/ics-proxy.ts`       |
| `ics-feed`   | `supabase/funciones-para-pegar/ics-feed.ts`        |

En **Edge Functions** → **Deploy a new function** → **Via Editor**: ponés el
nombre de la izquierda, borrás lo que viene de ejemplo y pegás el archivo
entero.

> Esos tres archivos son generados: el código que se edita está en
> `supabase/functions/`. Si tocás algo ahí, regenerá con
> `node supabase/armar-funciones.mjs`. El CI avisa si te olvidás.

> Con el CLI de Supabase es más corto todavía y no hace falta lo anterior:
> `supabase functions deploy chef-ia ics-proxy ics-feed` desde la raíz del repo.
> El `supabase/config.toml` ya trae la configuración correcta.

### Lo que hay que tocar sí o sí en `ics-feed`

En **Edge Functions** → `ics-feed` → **Details**, poné **Verify JWT** en **off**.

Sin esto el calendario del celular no se puede suscribir: los clientes de
calendario no saben mandar un token de sesión. Lo que protege ese endpoint es el
token secreto que va en el link.

Las otras dos quedan con Verify JWT en **on**, que es el valor por defecto.

---

## 5. La clave del agente de IA

> Si reusaste el proyecto de Nuestras Finanzas, **esto ya está**: el asesor de
> Finanzas usa el mismo secreto. Fijate en Edge Functions → Secrets si aparece
> `GROQ_KEY` y saltealo.

El agente usa Groq, que tiene un plan gratuito más que suficiente para esto.

1. Entrá a [console.groq.com/keys](https://console.groq.com/keys) y creá una
   API key.
2. En Supabase: **Edge Functions** → **Secrets** → **Add new secret**.
   - Nombre: `GROQ_KEY`
   - Valor: la clave.

Opcional, pero recomendado cuando ya sepas la dirección de tu app: agregá otro
secreto `ORIGENES_PERMITIDOS` con el valor
`https://TU-USUARIO.github.io`. Con eso las funciones solo responden a tu sitio.

---

## 6. Conectar la app

En **Project Settings** → **Data API** copiá:

- **Project URL** → algo como `https://abcdefgh.supabase.co`
- **anon / publishable key** → la que dice `anon` o `publishable`

Editá [`config.js`](config.js) y pegá los dos valores:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_...',
};
```

> **En este repo ya está cargado** con el proyecto de Nuestras Finanzas. Solo
> hay que tocarlo si algún día cambiás de proyecto.

**Nunca pongas ahí la `service_role`.** Esa saltea toda la seguridad del esquema
y da acceso completo a los datos. La `anon` es pública por diseño: viaja en
cualquier app web, y lo que protege los datos es el RLS que creaste en el paso 2.

> Si preferís no escribir las claves en el código, dejá `config.js` como está: la
> app abre una pantalla para cargarlas a mano y las guarda en ese navegador. La
> contra es que hay que hacerlo en cada teléfono.

---

## 7. Publicar con GitHub Pages

1. Subí los cambios al repo.
2. En GitHub: **Settings** → **Pages** → **Source**: **GitHub Actions**.
3. Listo. El workflow que ya está en el repo publica en cada push a `main`.

La app queda en `https://TU-USUARIO.github.io/nuestra-agenda/`.

> **El repositorio tiene que ser público** para que GitHub Pages funcione con
> una cuenta gratuita (con GitHub Pro también anda en privado). Publicar el
> código no expone tus datos: lo único que queda a la vista es la URL del
> proyecto y la clave pública, y los datos los protege el RLS. Aun así, hacé el
> paso de apagar el registro del punto 3.

---

## 8. Instalarla en el celular

Abrí la dirección en el celular y:

- **Android (Chrome):** menú de tres puntos → *Agregar a la pantalla principal*.
- **iPhone (Safari):** compartir → *Agregar a pantalla de inicio*.

Queda como una app más, con su ícono y sin la barra del navegador.

---

## 9. Empezar a usarla

1. Creá tu cuenta con tu mail.
2. **Crear nuestro hogar**, ponele nombre, elegí tu color.
3. Andá a **Más** → **Invitar** y pasale el código de 6 letras a tu pareja. Ella
   se crea su cuenta y entra con ese código.
4. **Más** → **Sumar a alguien de la familia** para cargar a tu hijo. No necesita
   cuenta: es para poder decir de quién es cada evento.
5. **Más** → **Suscribir el calendario del teléfono**. Hacelo en los dos
   celulares. **Este es el paso que hace que la app sirva para no olvidarse las
   cosas**: a partir de acá los recordatorios los da el calendario del sistema.

---

## Si algo no anda

**"No se pudieron traer los datos"** — falta correr el `schema.sql` del paso 2,
o la URL o la clave están mal en `config.js`.

**No llega el mail de confirmación** — apagá *Confirm email* (paso 3). El
servidor de prueba de Supabase casi no manda mails.

**El agente dice "Falta el secreto GROQ_KEY"** — paso 5. Después de agregar un
secreto hay que volver a desplegar la función para que lo tome.

**El calendario del celular no trae nada** — casi siempre es el *Verify JWT* de
`ics-feed`, que quedó en on (paso 4). Para probarlo, pegá el link del feed en el
navegador: tiene que bajar un archivo que arranca con `BEGIN:VCALENDAR`. Si en
cambio ves un error de autorización, es eso.

**El calendario tarda en actualizarse** — es así: los calendarios suscritos se
refrescan cuando el teléfono quiere, y Google puede tardar varias horas. Para
algo de hoy mismo, usá *Agregar al calendario del celular* desde el evento.

**"Eso no es un calendario" al importar** — el link pide login. Buscá en el sitio
la opción de *suscribirse* o *exportar .ics*, que da un link público.

---

## Si querés tocar el código

Las pruebas corren sin ningún servicio de afuera:

```bash
./supabase/tests/run.sh          # el esquema y el RLS, sobre un Postgres real
deno task test                   # las funciones y las librerías
node pruebas/app.test.mjs        # la app entera, en un Chromium real
```
