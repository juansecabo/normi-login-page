// Catálogo "Normi te guía" — Módulo BIBLIOTECA (ficha Biblioteca, 2026-10-04).
//
// Una ficha para todos los perfiles (/biblioteca, secciones por ?seccion=; todo por el NÚMERO del libro (1, 2, 3…), sin cámara ni lector):
//  - Todos: Catálogo (búsqueda y disponibilidad) y Mis préstamos (el acudiente: los de sus hijos).
//  - Bibliotecario(a) y Administrador: Catálogo (agregar y prestar), Comunidad (cada persona: prestar, recibir, filtros) y Etiquetas
//    (vencidos, renovar, perdido/repuesto), Etiquetas (PDF), Paz y salvo. Sin límites ni reglas.
//  - Rector, coordinación, secretaría y administrativos: Préstamos y Paz y salvo (solo ver) y
//    nada más.

import type { Capacidad } from "../tipos";

const LLEGAR = { narracion: "En el inicio, toca la ficha Biblioteca.", accion: "click" as const, ancla: "dashboard.ficha_biblioteca" };
const tab = (k: string, nombre: string) => ({ narracion: `Toca la sección '${nombre}'.`, accion: "click" as const, ancla: `biblioteca.tab_${k}` });
const TODOS = ["profesor", "rector", "coordinador", "secretaria", "administrativo", "orientador", "portero", "bibliotecario", "admin", "estudiante", "acudiente"] as const;
const GESTIONAN = ["bibliotecario", "admin"] as const;
const CONSULTAN = ["bibliotecario", "admin", "rector", "coordinador", "secretaria", "administrativo"] as const;

export const BIBLIOTECA: Capacidad[] = [
  {
    id: "biblioteca.buscar_libro",
    titulo: "Buscar un libro en la biblioteca y ver si está disponible",
    descripcion: "Buscar en el catálogo por título, autor, materia, ISBN o número del libro y ver cuántas copias hay disponibles o cuándo vuelve el libro.",
    categoria: "Biblioteca",
    roles: [...TODOS],
    ruta: "/biblioteca?seccion=catalogo",
    endpoint: "GET /api/biblioteca/catalogo",
    sinonimos: ["buscar un libro", "hay tal libro en la biblioteca", "está disponible el libro", "catálogo de la biblioteca", "qué libros hay"],
    pasos: [
      LLEGAR,
      tab("catalogo", "Catálogo"),
      { narracion: "Escribe el título, el autor o el número del libro (sin preocuparte por tildes). Cada libro dice si está disponible o cuándo vuelve; tócalo para ver el detalle.", accion: "escribir", ancla: "biblioteca.buscar", campo: "busqueda" },
    ],
  },
  {
    id: "biblioteca.mis_prestamos",
    titulo: "Ver mis libros prestados y renovarlos",
    descripcion: "Ver qué libros tiene prestados, hasta cuándo, y renovarlos en línea si aún no vencen. El acudiente ve los de cada hijo y si están a paz y salvo.",
    categoria: "Biblioteca",
    roles: ["profesor", "rector", "coordinador", "secretaria", "administrativo", "orientador", "portero", "estudiante", "acudiente"],
    ruta: "/biblioteca?seccion=mis",
    endpoint: "GET /api/biblioteca/mis-prestamos",
    sinonimos: ["mis libros prestados", "cuándo devuelvo el libro", "renovar un libro", "libros de mi hijo", "paz y salvo de biblioteca de mi hijo"],
    pasos: [
      LLEGAR,
      { narracion: "Toca la sección 'Mis préstamos' (o 'Préstamos de mis hijos').", accion: "click", ancla: "biblioteca.tab_mis" },
      { narracion: "Aquí ves cada libro y la fecha de devolución; con 'Renovar' amplías el plazo si todavía no ha vencido.", accion: "explicar", ancla: "biblioteca.mis_prestamos" },
    ],
  },
  {
    id: "biblioteca.agregar_libro",
    titulo: "Agregar libros al catálogo de la biblioteca",
    descripcion: "Registrar un libro con su título (lo único obligatorio), el autor y cuántas copias hay; cada copia recibe su número (1, 2, 3…) para la etiqueta.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?seccion=catalogo",
    endpoint: "POST /api/biblioteca/obras",
    sinonimos: ["agregar un libro", "catalogar libros", "registrar libros nuevos", "numerar los libros", "inventario de libros"],
    pasos: [
      LLEGAR,
      tab("catalogo", "Catálogo"),
      { narracion: "Toca 'Agregar libro'.", accion: "click", ancla: "biblioteca.agregar_libro" },
      { narracion: "Escribe el título (es lo único obligatorio) y, si lo tienes, el autor.", accion: "escribir", ancla: "biblioteca.form_titulo", campo: "titulo" },
      { narracion: "Elige el género y para qué edades es el libro.", accion: "seleccionar", ancla: "biblioteca.form_genero", campo: "genero", opcional: true },
      { narracion: "Indica cuántas copias hay con las flechitas: cada una recibe su número para la etiqueta.", accion: "click", ancla: "biblioteca.form_cantidad", campo: "cantidad" },
      { narracion: "Si quieres, en 'Más datos (opcional)' puedes poner el ISBN, la portada y lo demás.", accion: "explicar", ancla: "biblioteca.form_mas", opcional: true },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "biblioteca.form_guardar" },
    ],
  },
  {
    id: "biblioteca.prestar",
    titulo: "Prestar un libro",
    descripcion: "Prestar desde el Catálogo (abrir el libro y tocar Prestar en una copia) o desde Comunidad (abrir a la persona y buscar el libro). Se escoge la fecha de devolución; no hay límite de libros.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?seccion=comunidad",
    endpoint: "POST /api/biblioteca/prestamos",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante (o persona del personal) que pide el libro." }],
    sinonimos: ["prestar un libro", "préstamo de libro", "sacar un libro", "registrar préstamo", "prestarle un libro a un estudiante"],
    pasos: [
      LLEGAR,
      tab("comunidad", "Comunidad"),
      { narracion: "Busca a la persona por su nombre o apellido y tócala.", accion: "escribir", ancla: "biblioteca.comunidad_buscar", campo: "persona" },
      { narracion: "En 'Prestarle un libro' escribe el título, el autor o el número del libro, revisa la fecha de devolución y toca 'Prestar'.", accion: "explicar", ancla: "biblioteca.persona_prestar" },
    ],
  },
  {
    id: "biblioteca.devolver",
    titulo: "Recibir la devolución de un libro",
    descripcion: "En Comunidad se abre a la persona y, en el libro que trae, se toca 'Devolvió'.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?seccion=comunidad",
    endpoint: "POST /api/biblioteca/devoluciones",
    sinonimos: ["devolver un libro", "recibir libro", "devolución de libro", "trajo el libro"],
    pasos: [
      LLEGAR,
      tab("comunidad", "Comunidad"),
      { narracion: "Busca a la persona y tócala.", accion: "escribir", ancla: "biblioteca.comunidad_buscar", campo: "persona" },
      { narracion: "En el libro que devuelve, toca 'Devolvió'.", accion: "explicar", ancla: "biblioteca.persona_devolver" },
    ],
  },
  {
    id: "biblioteca.vencidos",
    titulo: "Ver quién tiene libros, quién está atrasado y quién está a paz y salvo",
    descripcion: "En Comunidad están todos los estudiantes y el personal en orden alfabético, con su estado; se filtra por con libros, atrasados, perdidos o sin libros (paz y salvo).",
    categoria: "Biblioteca",
    roles: [...CONSULTAN],
    ruta: "/biblioteca?seccion=comunidad",
    endpoint: "GET /api/biblioteca/comunidad",
    sinonimos: ["libros vencidos", "quién debe libros", "libros sin devolver", "libro perdido", "paz y salvo de biblioteca", "quién tiene libros prestados", "atrasados"],
    pasos: [
      LLEGAR,
      tab("comunidad", "Comunidad"),
      { narracion: "Usa los filtros de arriba: Con libros, Atrasados, Perdidos o Paz y salvo.", accion: "click", ancla: "biblioteca.comunidad_filtros" },
    ],
  },
  {
    id: "biblioteca.etiquetas",
    titulo: "Imprimir las etiquetas de los libros",
    descripcion: "Imprimir las etiquetas del número tal al número tal: cada una lleva el número del libro en grande y su título, para pegarla en el libro.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?seccion=etiquetas",
    endpoint: "GET /api/biblioteca/etiquetas",
    sinonimos: ["etiquetar libros", "imprimir etiquetas", "imprimir los números de los libros", "etiquetas del 1 al 50", "rotular libros"],
    pasos: [
      LLEGAR,
      tab("etiquetas", "Etiquetas"),
      { narracion: "Escribe desde qué número y hasta qué número quieres las etiquetas (ya vienen llenos con las que faltan).", accion: "escribir", ancla: "biblioteca.etiquetas_desde", campo: "desde" },
      { narracion: "Toca 'Imprimir etiquetas', imprime el PDF en papel adhesivo tamaño carta y pega cada etiqueta en su libro.", accion: "click", ancla: "biblioteca.generar_etiquetas" },
    ],
  },
];
