// ============================================================================
//  Menú de la semana: qué se come cada día, y de dónde sale.
//
//  Lo que distingue a esta pantalla: mira la agenda. Si el martes hay natación
//  a las 19, el día aparece marcado como complicado y el buscador de recetas
//  arranca filtrado por las que se hacen en media hora.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import {
  buscarRecetas,
  receta as recetaPorId,
  recetasDelMes,
  RUBROS,
} from '../data/recetas.js';
import { clasificar, temporadaDe } from '../data/temporada.js';
import {
  conMayuscula,
  DIAS_CORTOS,
  fechaHumana,
  hoy,
  inicioSemana,
  partes,
  rangoSemanaHumano,
  semanaDe,
  sumarDias,
} from '../lib/fechas.js';
import {
  areaTexto,
  avisoBien,
  avisoMal,
  campo,
  cerrarHoja,
  confirmar,
  conEspera,
  el,
  elegir,
  entrada,
  hoja,
  pintar,
  vacio,
} from '../lib/ui.js';

const MOMENTOS = ['almuerzo', 'cena'];

// ---------------------------------------------------------------------------
//  Editor de una comida
// ---------------------------------------------------------------------------

/** Chip que dice si un ingrediente está en su momento. */
function chipIngrediente(item, mes) {
  const c = clasificar(item, mes);
  if (c === 'temporada') return el('span.chip.mini.temporada', { texto: 'de temporada' });
  if (c === 'fuera') return el('span.chip.mini.fuera', { texto: 'fuera de temporada' });
  return null;
}

/**
 * Abre la hoja para decidir qué se come.
 * @param {object} opciones { fecha, momento, comida }
 */
export function abrirEditorComida({ fecha, momento, comida = null }) {
  const mes = partes(fecha).mes;
  const t = temporadaDe(mes);
  const carga = est.cargaDelDia(fecha);
  // Un día con cosas a la tarde arranca filtrado por lo rápido.
  const diaComplicado = carga.tarde > 0;

  const b = {
    titulo: comida?.titulo ?? '',
    receta_id: comida?.receta_id ?? null,
    notas: comida?.notas ?? '',
    ingredientes: (comida?.ingredientes ?? []).map((i) => ({ ...i })),
    etiquetas: [...(comida?.etiquetas ?? [])],
    a_cargo: comida?.a_cargo ?? '',
  };

  const campoTitulo = entrada({
    value: b.titulo,
    placeholder: 'Tarta de acelga',
    required: true,
    maxlength: 140,
    'on:input': (e) => {
      b.titulo = e.target.value;
      // Si se escribe a mano, ya no es la receta del recetario.
      b.receta_id = null;
    },
  });

  // --- ingredientes ---
  const listaIngs = el('div');

  function pintarIngredientes() {
    if (!b.ingredientes.length) {
      pintar(listaIngs, el('p.ayuda', {
        texto: 'Sin ingredientes. Los que cargues acá se pueden volcar a la lista de compras.',
      }));
      return;
    }

    pintar(listaIngs, ...b.ingredientes.map((ing, i) =>
      el('div', {
        estilo: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' },
      }, [
        el('div', { estilo: { flex: '1', minWidth: '0' } }, [
          entrada({
            value: ing.item,
            placeholder: 'Ingrediente',
            'aria-label': `Ingrediente ${i + 1}`,
            'on:input': (e) => {
              ing.item = e.target.value;
              pintarChip();
            },
          }),
        ]),
        entrada({
          value: ing.cantidad ?? '',
          placeholder: 'Cuánto',
          'aria-label': `Cantidad de ${ing.item || 'ingrediente'}`,
          estilo: { flex: '0 0 84px' },
          'on:input': (e) => (ing.cantidad = e.target.value),
        }),
        el('button.btn.chico.fantasma', {
          type: 'button',
          texto: '×',
          'aria-label': `Quitar ${ing.item || 'ingrediente'}`,
          estilo: { flex: 'none', minHeight: '38px', padding: '0 11px' },
          'on:click': () => {
            b.ingredientes.splice(i, 1);
            pintarIngredientes();
          },
        }),
      ])
    ));

    // Los avisos de temporada, debajo de la lista.
    const chips = el('div.chips', { estilo: { marginTop: '8px' } });
    for (const ing of b.ingredientes) {
      if (!ing.item?.trim()) continue;
      const chip = chipIngrediente(ing.item, mes);
      if (chip && chip.classList.contains('fuera')) {
        chips.append(el('span.chip.mini.fuera', { texto: `${ing.item}: fuera de temporada` }));
      }
    }
    if (chips.children.length) listaIngs.append(chips);
  }

  // Se vuelve a pintar el bloque entero al cambiar un ingrediente, con espera
  // para no repintar en cada tecla.
  const pintarChip = conEspera(() => pintarIngredientes(), 600);

  pintarIngredientes();

  const btnSumarIng = el('button.btn.chico.fantasma.ancho', {
    type: 'button',
    texto: '+ Sumar ingrediente',
    'on:click': () => {
      b.ingredientes.push({ item: '', cantidad: '', rubro: 'verduleria' });
      pintarIngredientes();
      listaIngs.querySelector('input:last-of-type');
    },
  });

  // --- recetario ---
  const resultados = el('div');

  function pintarResultados(texto = '', soloRapidas = diaComplicado) {
    const encontradas = texto.trim()
      ? buscarRecetas(texto)
      : recetasDelMes(mes, {
        momento,
        maxMin: soloRapidas ? 35 : undefined,
      });

    if (!encontradas.length) {
      pintar(resultados, el('p.ayuda', { texto: 'No encontré nada con eso.' }));
      return;
    }

    pintar(resultados, ...encontradas.slice(0, 14).map((r) =>
      el('button.comida-slot', {
        type: 'button',
        estilo: { marginBottom: '6px' },
        'on:click': () => {
          b.titulo = r.nombre;
          b.receta_id = r.id;
          b.ingredientes = r.ingredientes.map((i) => ({ ...i }));
          b.etiquetas = [...r.etiquetas];
          campoTitulo.value = r.nombre;
          pintarIngredientes();
          avisoBien(`${r.nombre}, cargada`);
        },
      }, [
        el('span.plato', {}, [
          r.nombre,
          el('span.meta', {
            texto: `${r.tiempo_min} min · ${r.etiquetas.slice(0, 2).join(', ')}`,
          }),
        ]),
        el('span', {
          'aria-hidden': 'true',
          estilo: { color: 'var(--suave)', fontSize: '0.8rem' },
          texto: '+',
        }),
      ])
    ));
  }

  const buscador = entrada({
    type: 'text',
    placeholder: 'Buscar en el recetario…',
    'on:input': conEspera((e) => pintarResultados(e.target.value), 250),
  });

  const swRapidas = el('button.chip', {
    type: 'button',
    texto: '⚡ Hasta 35 min',
    'aria-pressed': String(diaComplicado),
    'on:click': (e) => {
      const activo = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(activo));
      pintarResultados(buscador.value, activo);
    },
  });

  pintarResultados();

  // --- quién cocina ---
  const selACargo = elegir(
    [['', 'Cualquiera'], ...est.estado.personas.map((p) => [p.id, `${p.emoji} ${p.nombre}`])],
    b.a_cargo,
    { 'on:change': (e) => (b.a_cargo = e.target.value) },
  );

  const campoNotas = areaTexto({
    value: b.notas,
    placeholder: 'Dejar en remojo la noche anterior',
    maxlength: 500,
    estilo: { minHeight: '60px' },
    'on:input': (e) => (b.notas = e.target.value),
  });

  const error = el('p.error-campo');
  const btnGuardar = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });

  const form = el('form', { novalidate: true }, [
    // El aviso del día complicado, arriba de todo, que es la información que
    // cambia la decisión.
    diaComplicado
      ? el('div.tarjeta.plana', {
        estilo: { marginBottom: '14px', borderColor: 'var(--calido)' },
      }, [
        el('p', {
          estilo: { fontSize: '0.84rem', color: 'var(--calido)', fontWeight: '700' },
          texto: `Ese día hay ${carga.tarde} ${carga.tarde === 1 ? 'cosa' : 'cosas'} a la tarde.`,
        }),
        el('p', {
          estilo: { fontSize: '0.8rem', color: 'var(--suave)', marginTop: '3px' },
          texto: 'Conviene algo rápido, o cocinar de más el día anterior.',
        }),
      ])
      : null,

    campo('¿Qué se come?', campoTitulo),

    el('div.campo', {}, [
      el('label', { texto: `Del recetario · ${t.estacion} en Buenos Aires` }),
      el('div.chips', { estilo: { marginBottom: '8px' } }, [swRapidas]),
      buscador,
      el('div', { estilo: { marginTop: '8px' } }, [resultados]),
    ]),

    el('div.campo', {}, [
      el('label', { texto: 'Ingredientes' }),
      listaIngs,
      btnSumarIng,
    ]),

    campo('¿Quién cocina?', selACargo),
    campo('Nota', campoNotas),
    error,
  ]);

  const acciones = el('div.acciones', {}, [
    el('button.btn.fantasma', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btnGuardar,
  ]);
  form.append(acciones);

  const extras = el('div', { estilo: { marginTop: '12px' } });
  if (comida) {
    // Ver la receta completa, si vino del recetario.
    const r = comida.receta_id ? recetaPorId(comida.receta_id) : null;
    if (r) {
      extras.append(el('button.btn.fantasma.ancho.chico', {
        type: 'button',
        texto: '📖  Ver la receta',
        estilo: { marginBottom: '8px' },
        'on:click': () => abrirReceta(r, mes),
      }));
    }
    extras.append(el('button.btn.peligro.ancho.chico', {
      type: 'button',
      texto: '🗑  Sacar del menú',
      'on:click': async () => {
        try {
          await db.borrarComida(comida.id);
          await est.recargar('menu');
          cerrarHoja();
          avisoBien('Sacado');
        } catch (e) {
          avisoMal(db.mensajeDeError(e));
        }
      },
    }));
  }

  let guardando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;

    error.textContent = '';
    if (!b.titulo.trim()) {
      error.textContent = 'Falta decir qué se come';
      campoTitulo.focus();
      return;
    }

    guardando = true;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando…';

    try {
      await db.guardarComida({
        // Sin id: el upsert por (hogar, fecha, momento) resuelve si va a
        // insertar o reemplazar, así que no hace falta saberlo acá.
        hogar_id: est.estado.hogar.id,
        fecha,
        momento,
        titulo: b.titulo.trim(),
        receta_id: b.receta_id,
        notas: b.notas.trim() || null,
        ingredientes: b.ingredientes
          .filter((i) => i.item?.trim())
          .map((i) => ({
            item: i.item.trim(),
            cantidad: (i.cantidad ?? '').trim(),
            rubro: i.rubro ?? 'otros',
          })),
        etiquetas: b.etiquetas,
        a_cargo: b.a_cargo || null,
      });
      await est.recargar('menu');
      cerrarHoja();
      avisoBien('Anotado');
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
    } finally {
      guardando = false;
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Guardar';
    }
  });

  hoja({
    titulo: `${momento === 'almuerzo' ? 'Almuerzo' : 'Cena'} del ${fechaHumana(fecha).toLowerCase()}`,
    contenido: [form, extras],
  });
}

/** La receta completa, para leer mientras se cocina. */
export function abrirReceta(r, mes = partes(hoy()).mes) {
  hoja({
    titulo: r.nombre,
    bajada: `${r.tiempo_min} minutos · ${r.etiquetas.join(' · ')}`,
    contenido: el('div.receta-cuerpo', {}, [
      el('h3', {
        estilo: {
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          color: 'var(--suave)',
          marginBottom: '4px',
        },
        texto: 'Ingredientes',
      }),
      el('ul.ingredientes', {}, r.ingredientes.map((i) =>
        el('li', {}, [
          el('span', { 'aria-hidden': 'true', texto: RUBROS[i.rubro]?.emoji ?? '📦' }),
          el('span', { texto: i.item }),
          chipIngrediente(i.item, mes),
          i.cantidad ? el('span.cant', { texto: i.cantidad }) : null,
        ])
      )),
      el('h3', {
        estilo: {
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          color: 'var(--suave)',
          margin: '18px 0 6px',
        },
        texto: 'Cómo se hace',
      }),
      el('p', { texto: r.pasos }),
    ]),
  });
}

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

export function vistaMenu(destino) {
  const refSemana = est.estado.semanaVisible ?? hoy();
  const dias = semanaDe(refSemana);
  const mes = partes(dias[3]).mes; // el jueves, para no dudar en el cambio de mes
  const t = temporadaDe(mes);

  const irASemana = async (delta) => {
    const nueva = sumarDias(inicioSemana(refSemana), delta * 7);
    est.estado.semanaVisible = nueva;
    await est.asegurarRango(nueva);
    est.avisar();
  };

  const nav = el('div.mes-nav', {}, [
    el('button', {
      type: 'button',
      'aria-label': 'Semana anterior',
      texto: '‹',
      'on:click': () => irASemana(-1),
    }),
    el('span.titulo', { texto: conMayuscula(rangoSemanaHumano(refSemana)) }),
    el('button', {
      type: 'button',
      'aria-label': 'Semana siguiente',
      texto: '›',
      'on:click': () => irASemana(1),
    }),
  ]);

  // Qué hay de temporada esta semana: es el dato que ordena todo lo demás.
  const tarjetaTemporada = el('div.tarjeta.plana', {}, [
    el('p', {
      estilo: {
        fontSize: '0.68rem',
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        color: 'var(--suave)',
      },
      texto: `De temporada · ${t.estacion} en Buenos Aires`,
    }),
    el('div.chips', { estilo: { marginTop: '8px' } }, [
      ...t.verduras.slice(0, 7).map((v) => el('span.chip.mini.temporada', { texto: v })),
      ...t.frutas.slice(0, 4).map((f) => el('span.chip.mini.temporada', { texto: f })),
    ]),
  ]);

  // --- los siete días ---
  const tarjetasDias = dias.map((fecha) => {
    const comidas = est.comidasDe(fecha);
    const carga = est.cargaDelDia(fecha);
    const p = partes(fecha);

    return el('div.dia-menu', {
      clase: fecha === hoy() ? 'es-hoy' : '',
    }, [
      el('header', {}, [
        el('span.dow', { texto: DIAS_CORTOS[new Date(`${fecha}T12:00:00Z`).getUTCDay()] }),
        el('span.num', { texto: `${p.dia}/${p.mes}` }),
        carga.tarde > 0
          ? el('span.agenda-aviso', {
            texto: `${carga.tarde} cosa${carga.tarde === 1 ? '' : 's'} a la tarde`,
          })
          : (carga.total > 0
            ? el('span.agenda-aviso', {
              estilo: { color: 'var(--suave)' },
              texto: `${carga.total} en agenda`,
            })
            : null),
      ]),
      ...MOMENTOS.map((momento) => {
        const c = comidas[momento];
        if (!c) {
          return el('button.comida-slot.vacia', {
            type: 'button',
            'on:click': () => abrirEditorComida({ fecha, momento }),
          }, [
            el('span.momento', { texto: momento }),
            el('span.plato', { texto: 'Elegir' }),
            el('span', { 'aria-hidden': 'true', texto: '+' }),
          ]);
        }
        const aCargo = c.a_cargo ? est.persona(c.a_cargo) : null;
        return el('button.comida-slot', {
          type: 'button',
          'on:click': () => abrirEditorComida({ fecha, momento, comida: c }),
        }, [
          el('span.momento', { texto: momento }),
          el('span.plato', {}, [
            c.titulo,
            aCargo ? el('span.meta', { texto: `cocina ${aCargo.nombre}` }) : null,
          ]),
        ]);
      }),
    ]);
  });

  // --- acciones de la semana ---
  const cuantasComidas = dias.reduce(
    (n, f) => n + MOMENTOS.filter((m) => est.comida(f, m)).length,
    0,
  );

  const acciones = el('div.seccion', {}, [
    el('div.btn-fila', {}, [
      el('button.btn.primario', {
        type: 'button',
        texto: '👩‍🍳  Que lo arme la IA',
        'on:click': () => est.irA('chef', { semanaVisible: refSemana }),
      }),
      el('button.btn', {
        type: 'button',
        texto: '🛒  A la lista',
        disabled: cuantasComidas === 0,
        'on:click': async () => {
          try {
            const n = await db.menuALaLista(
              est.estado.hogar.id,
              dias[0],
              dias[6],
            );
            await est.recargar('compras');
            avisoBien(
              n === 0
                ? 'Ya estaba todo en la lista'
                : `${n} ${n === 1 ? 'cosa' : 'cosas'} a la lista`,
            );
            if (n > 0) est.irA('compras');
          } catch (e) {
            avisoMal(db.mensajeDeError(e));
          }
        },
      }),
    ]),
    cuantasComidas === 0
      ? el('p.ayuda', {
        estilo: { textAlign: 'center', marginTop: '8px' },
        texto: 'Cargá alguna comida y después volcás los ingredientes a la lista de compras.',
      })
      : null,
    cuantasComidas > 0
      ? el('button.btn.fantasma.ancho.chico', {
        type: 'button',
        texto: 'Vaciar la semana',
        estilo: { marginTop: '10px' },
        'on:click': async () => {
          const ok = await confirmar({
            titulo: '¿Vaciar el menú de la semana?',
            bajada: `Se borran las ${cuantasComidas} comidas de ${rangoSemanaHumano(refSemana)}.`,
            siTexto: 'Sí, vaciar',
            peligroso: true,
          });
          if (!ok) return;
          try {
            const aBorrar = est.estado.menu.filter((m) =>
              dias.includes(m.fecha?.slice(0, 10))
            );
            await Promise.all(aBorrar.map((m) => db.borrarComida(m.id)));
            await est.recargar('menu');
            avisoBien('Semana vacía');
          } catch (e) {
            avisoMal(db.mensajeDeError(e));
          }
        },
      })
      : null,
  ]);

  pintar(destino,
    el('section.seccion', {}, [nav, tarjetaTemporada]),
    el('section.seccion', {}, tarjetasDias),
    acciones,
  );

  return null;
}

// ---------------------------------------------------------------------------
//  Lista de compras
// ---------------------------------------------------------------------------

export function vistaCompras(destino) {
  const todas = est.estado.compras;
  const pendientes = todas.filter((c) => !c.comprado);
  const compradas = todas.filter((c) => c.comprado);

  // Agrupadas por comercio: así se recorre la cuadra una sola vez.
  const porRubro = new Map();
  for (const c of pendientes) {
    const r = RUBROS[c.rubro] ? c.rubro : 'otros';
    if (!porRubro.has(r)) porRubro.set(r, []);
    porRubro.get(r).push(c);
  }
  const rubrosOrdenados = [...porRubro.entries()]
    .sort((a, b) => (RUBROS[a[0]]?.orden ?? 9) - (RUBROS[b[0]]?.orden ?? 9));

  const alternar = async (c) => {
    try {
      await db.editarCompra(c.id, { comprado: !c.comprado });
      await est.recargar('compras');
    } catch (e) {
      avisoMal(db.mensajeDeError(e));
    }
  };

  const filaCompra = (c) =>
    el('button.compra', {
      type: 'button',
      clase: c.comprado ? 'listo' : '',
      'on:click': () => alternar(c),
    }, [
      el('span.caja', { 'aria-hidden': 'true', texto: '✓' }),
      el('span.nombre', { texto: c.item }),
      c.cantidad ? el('span.cant', { texto: c.cantidad }) : null,
    ]);

  // --- sumar algo a mano ---
  const campoItem = entrada({
    placeholder: 'Papel de cocina',
    'aria-label': 'Qué falta',
    maxlength: 120,
  });
  const selRubro = elegir(
    Object.entries(RUBROS).map(([k, v]) => [k, `${v.emoji} ${v.nombre}`]),
    'otros',
    { estilo: { flex: '0 0 140px' } },
  );

  const formSumar = el('form', {
    estilo: { display: 'flex', gap: '6px', marginBottom: '16px' },
    novalidate: true,
  }, [
    campoItem,
    selRubro,
    el('button.btn.primario', {
      type: 'submit',
      texto: '+',
      estilo: { flex: 'none', padding: '0 16px' },
      'aria-label': 'Sumar a la lista',
    }),
  ]);

  formSumar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = campoItem.value.trim();
    if (!item) return;
    try {
      await db.agregarCompra({
        hogar_id: est.estado.hogar.id,
        item,
        rubro: selRubro.value,
        origen: 'manual',
      });
      campoItem.value = '';
      campoItem.focus();
      await est.recargar('compras');
    } catch (err) {
      avisoMal(db.mensajeDeError(err));
    }
  });

  const secciones = rubrosOrdenados.map(([rubro, items]) =>
    el('section.seccion', {}, [
      el('h2', {}, [
        `${RUBROS[rubro].emoji} ${RUBROS[rubro].nombre}`,
        el('span.contador', { texto: String(items.length) }),
      ]),
      el('div', {}, items.map(filaCompra)),
    ])
  );

  pintar(destino,
    formSumar,
    pendientes.length
      ? el('div', {}, secciones)
      : vacio('🛒', 'La lista está vacía. Se llena sola desde el menú de la semana.'),
    compradas.length
      ? el('section.seccion', {}, [
        el('h2', {}, [
          'Ya comprado',
          el('span.contador', { texto: String(compradas.length) }),
        ]),
        el('div', {}, compradas.map(filaCompra)),
        el('button.btn.fantasma.ancho.chico', {
          type: 'button',
          texto: 'Limpiar lo comprado',
          estilo: { marginTop: '10px' },
          'on:click': async () => {
            try {
              await db.borrarComprados(est.estado.hogar.id);
              await est.recargar('compras');
              avisoBien('Lista limpia');
            } catch (e) {
              avisoMal(db.mensajeDeError(e));
            }
          },
        }),
      ])
      : null,
  );

  return null;
}
