// ============================================================================
//  Comidas: el menú de la semana y la lista de compras, en dos solapas.
//
//  Van juntas porque son la misma decisión mirada en dos momentos: qué se come
//  y qué hay que comprar para poder comerlo. La lista se llena sola desde el
//  menú, así que separarlas en dos secciones de la barra obligaba a saltar de
//  una a la otra todo el tiempo.
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
  diaSemana,
  DIAS_CORTOS,
  fechaHumana,
  hoy,
  inicioSemana,
  partes,
  rangoSemanaHumano,
  semanaDe,
  sumarDias,
} from '../lib/fechas.js';
import { icono } from '../lib/iconos.js';
import {
  areaTexto,
  avatar,
  avisoBien,
  avisoMal,
  campo,
  cerrarHoja,
  confirmar,
  conEspera,
  el,
  elegir,
  entrada,
  faltaLaTabla,
  hoja,
  marca,
  pintar,
  segmentado,
  vacio,
} from '../lib/ui.js';

const MOMENTOS = ['almuerzo', 'cena'];

// ---------------------------------------------------------------------------
//  Editor de una comida
// ---------------------------------------------------------------------------

/** Marquita que dice si un ingrediente está en su momento. */
function marcaIngrediente(item, mes) {
  const c = clasificar(item, mes);
  if (c === 'temporada') return marca('de temporada', 'hecha');
  if (c === 'fuera') return marca('fuera de temporada', 'hoy');
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
        el('button.btn.chico.linea', {
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
      if (clasificar(ing.item, mes) === 'fuera') {
        chips.append(marca(`${ing.item}: fuera de temporada`, 'hoy'));
      }
    }
    if (chips.children.length) listaIngs.append(chips);
  }

  // Se vuelve a pintar el bloque entero al cambiar un ingrediente, con espera
  // para no repintar en cada tecla.
  const pintarChip = conEspera(() => pintarIngredientes(), 600);

  pintarIngredientes();

  const btnSumarIng = el('button.btn.chico.linea.ancho', {
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
        icono('mas', { tamano: 16 }),
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
    texto: 'Hasta 35 min',
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
      ? el('div.tarjeta.plana', { estilo: { marginBottom: '14px' } }, [
        el('p.etiqueta', {
          estilo: { color: 'var(--terracota-texto)' },
          texto: `Ese día hay ${carga.tarde} ${carga.tarde === 1 ? 'cosa' : 'cosas'} a la tarde.`,
        }),
        el('p.cuerpo-chico', {
          estilo: { marginTop: '3px' },
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
    el('button.btn.linea', {
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
      extras.append(el('button.btn.linea.ancho.chico', {
        type: 'button',
        estilo: { marginBottom: '8px' },
        'on:click': () => abrirReceta(r, mes),
      }, [icono('nota', { tamano: 15 }), 'Ver la receta']));
    }
    extras.append(el('button.btn.peligro.ancho.chico', {
      type: 'button',
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
    }, [icono('basura', { tamano: 15 }), 'Sacar del menú']));
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
    contenido: el('div', {}, [
      el('h3.sobretitulo', { texto: 'Ingredientes' }),
      el('ul.ingredientes', {}, r.ingredientes.map((i) =>
        el('li', {}, [
          el('span', { texto: i.item }),
          marcaIngrediente(i.item, mes),
          i.cantidad ? el('span.cant', { texto: i.cantidad }) : null,
        ])
      )),
      el('h3.sobretitulo', {
        estilo: { marginTop: 'var(--e5)', marginBottom: 'var(--e2)' },
        texto: 'Cómo se hace',
      }),
      el('p.cuerpo', { texto: r.pasos }),
    ]),
  });
}

// ---------------------------------------------------------------------------
//  La vista: dos solapas sobre la misma sección
// ---------------------------------------------------------------------------

export function vistaComidas(destino) {
  const tab = est.estado.tabComidas ?? 'menu';

  const control = el('section.seccion', {}, [
    segmentado(
      [
        { valor: 'menu', texto: 'Menú semanal' },
        { valor: 'compras', texto: 'Lista de compras' },
      ],
      tab,
      (v) => est.poner({ tabComidas: v }),
      { etiqueta: 'Qué mirar de comidas' },
    ),
  ]);

  // Si la tabla de la solapa no está en la base, se dice qué falta en vez de
  // mostrar una sección vacía que parece rota.
  const tabla = tab === 'compras' ? 'ag_compras' : 'ag_menu';
  if (est.faltaEnLaBase(tabla)) {
    pintar(destino, control, el('section.seccion', {}, [
      faltaLaTabla(tabla, tab === 'compras' ? 'la lista de compras' : 'el menú semanal'),
    ]));
    return null;
  }

  const cuerpo = tab === 'compras' ? bloqueCompras() : bloqueMenu();

  pintar(destino, control, ...cuerpo);

  // El botón flotante cambia según la solapa: en el menú lleva al Chef, que es
  // la forma rápida de llenar la semana; en compras suma algo a mano.
  if (tab === 'menu') {
    return el('button.fab', {
      type: 'button',
      'aria-label': 'Que la IA arme el menú',
      'on:click': () => est.irA('chef'),
    }, [icono('chispas', { tamano: 26, trazo: 2 })]);
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Solapa: menú de la semana
// ---------------------------------------------------------------------------

function bloqueMenu() {
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
      'on:click': () => irASemana(-1),
    }, [icono('izq')]),
    el('span.titulo.cap', { texto: rangoSemanaHumano(refSemana) }),
    el('button', {
      type: 'button',
      'aria-label': 'Semana siguiente',
      'on:click': () => irASemana(1),
    }, [icono('der')]),
  ]);

  // Qué hay de temporada esta semana: es el dato que ordena todo lo demás.
  const tarjetaTemporada = el('div.tarjeta.plana', {}, [
    el('p.sobretitulo', { texto: `De temporada · ${t.estacion} en Buenos Aires` }),
    el('div.chips', { estilo: { marginTop: '8px' } }, [
      ...t.verduras.slice(0, 7).map((v) => marca(v, 'hecha')),
      ...t.frutas.slice(0, 4).map((f) => marca(f, 'hecha')),
    ]),
  ]);

  // --- los siete días ---
  const tarjetasDias = dias.map((fecha) => {
    const comidas = est.comidasDe(fecha);
    const carga = est.cargaDelDia(fecha);
    const p = partes(fecha);

    const aviso = carga.tarde > 0
      ? marca(`${carga.tarde} cosa${carga.tarde === 1 ? '' : 's'} a la tarde`, 'hoy')
      : (carga.total > 0 ? marca(`${carga.total} en agenda`, 'pendiente') : null);

    return el('div.dia-menu', {
      clase: fecha === hoy() ? 'es-hoy' : '',
    }, [
      el('div.fecha-col', {}, [
        el('span.d', { texto: DIAS_CORTOS[diaSemana(fecha)] }),
        el('span.n', { texto: String(p.dia) }),
      ]),
      el('div.comidas-col', {}, [
        aviso ? el('div', { estilo: { marginBottom: '4px' } }, [aviso]) : null,
        ...MOMENTOS.map((momento) => {
          const c = comidas[momento];
          if (!c) {
            return el('button.comida-slot.vacia', {
              type: 'button',
              'on:click': () => abrirEditorComida({ fecha, momento }),
            }, [
              el('span.momento', { texto: momento }),
              el('span.plato', { texto: 'Elegir' }),
              icono('mas', { tamano: 16 }),
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
            aCargo ? avatar(aCargo, { tamano: 'chico' }) : null,
          ]);
        }),
      ]),
    ]);
  });

  // --- acciones de la semana ---
  const cuantasComidas = dias.reduce(
    (n, f) => n + MOMENTOS.filter((m) => est.comida(f, m)).length,
    0,
  );

  const acciones = el('section.seccion', {}, [
    el('div.btn-fila', {}, [
      el('button.btn.primario', {
        type: 'button',
        'on:click': () => est.irA('chef', { semanaVisible: refSemana }),
      }, [icono('chispas', { tamano: 16 }), 'Que lo arme la IA']),
      el('button.btn.suave', {
        type: 'button',
        disabled: cuantasComidas === 0,
        'on:click': async () => {
          try {
            const n = await db.menuALaLista(est.estado.hogar.id, dias[0], dias[6]);
            await est.recargar('compras');
            avisoBien(
              n === 0
                ? 'Ya estaba todo en la lista'
                : `${n} ${n === 1 ? 'cosa' : 'cosas'} a la lista`,
            );
            if (n > 0) est.poner({ tabComidas: 'compras' });
          } catch (e) {
            avisoMal(db.mensajeDeError(e));
          }
        },
      }, [icono('carrito', { tamano: 16 }), 'A la lista']),
    ]),
    cuantasComidas === 0
      ? el('p.cuerpo-chico', {
        estilo: { textAlign: 'center', marginTop: '8px' },
        texto: 'Cargá alguna comida y después volcás los ingredientes a la lista de compras.',
      })
      : null,
    cuantasComidas > 0
      ? el('button.btn.linea.ancho.chico', {
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

  return [
    el('section.seccion', {}, [nav, tarjetaTemporada]),
    el('section.seccion', {}, tarjetasDias),
    acciones,
  ];
}

// ---------------------------------------------------------------------------
//  Solapa: lista de compras
// ---------------------------------------------------------------------------

function bloqueCompras() {
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

  // De qué plato salió cada cosa: si aparece "3 zanahorias" en la lista, uno
  // quiere saber para qué eran antes de decidir si las compra igual.
  const deQuePlato = (c) => {
    if (c.origen !== 'menu') return null;
    const m = est.estado.menu.find((comida) =>
      (comida.ingredientes ?? []).some((i) =>
        i.item?.toLowerCase() === c.item?.toLowerCase()
      )
    );
    return m ? `Menú · ${m.titulo}` : null;
  };

  const filaCompra = (c) => {
    const de = deQuePlato(c);
    return el('button.compra', {
      type: 'button',
      clase: c.comprado ? 'listo' : '',
      'on:click': () => alternar(c),
    }, [
      el('span.caja', {}, [icono('tilde', { tamano: 13, trazo: 3 })]),
      el('span.nombre', {}, [c.item, de ? el('span.de', { texto: de }) : null]),
      c.cantidad ? el('span.cant', { texto: c.cantidad }) : null,
    ]);
  };

  // --- sumar algo a mano ---
  const campoItem = entrada({
    placeholder: 'Papel de cocina',
    'aria-label': 'Qué falta',
    maxlength: 120,
  });
  const selRubro = elegir(
    Object.entries(RUBROS).map(([k, v]) => [k, v.nombre]),
    'otros',
    { estilo: { flex: '0 0 128px' } },
  );

  const formSumar = el('form.seccion', {
    estilo: { display: 'flex', gap: '6px' },
    novalidate: true,
  }, [
    campoItem,
    selRubro,
    el('button.btn.primario', {
      type: 'submit',
      estilo: { flex: 'none', padding: '0 14px' },
      'aria-label': 'Sumar a la lista',
    }, [icono('mas', { tamano: 18, trazo: 2.4 })]),
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
      el('header', {}, [
        el('h2', { texto: RUBROS[rubro].nombre }),
        el('span.etiqueta', { texto: String(items.length) }),
      ]),
      el('div', {}, items.map(filaCompra)),
    ])
  );

  return [
    formSumar,
    pendientes.length
      ? el('div', {}, secciones)
      : el('section.seccion', {}, [
        vacio('carrito', 'La lista está vacía. Se llena sola desde el menú de la semana.'),
      ]),
    compradas.length
      ? el('section.seccion', {}, [
        el('header', {}, [
          el('h2', { texto: 'En el carrito' }),
          el('button.btn.chico.texto', {
            type: 'button',
            texto: 'Limpiar',
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
        ]),
        el('div', {}, compradas.map(filaCompra)),
      ])
      : null,
  ];
}
