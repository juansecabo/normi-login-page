// Catálogo "Normi te guía" — Módulo BIBLIOTECA (ficha Biblioteca, 2026-10-04).
//
// Una ficha para todos los perfiles (/biblioteca, secciones por ?seccion=; todo por el NÚMERO del libro (1, 2, 3…), sin cámara ni lector):
//  - Todos: Catálogo (búsqueda y disponibilidad) y Mis préstamos (el acudiente: los de sus hijos).
//  - Bibliotecario(a) y Administrador: Catálogo (prestar desde la ficha del libro), Etiquetas, Prestar, Devolver, Préstamos
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
    ruta: "/biblioteca",
    endpoint: "GET /api/biblioteca/catalogo",
    sinonimos: ["buscar un libro", "hay tal libro en la biblioteca", "está disponible el libro", "catálogo de la biblioteca", "qué libros hay"],
    pasos: [
      LLEGAR,
      { narracion: "Escribe en el buscador el título, el autor o el número del libro (sin preocuparte por tildes). Los resultados salen mientras escribes y dicen si está disponible o cuándo vuelve; toca uno para ver el detalle.", accion: "escribir", ancla: "biblioteca.buscador", campo: "busqueda" },
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
    descripcion: "Buscar a la persona, escribir el número del libro (el de su etiqueta), escoger la fecha de devolución y prestarlo. Sin límite de libros.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?seccion=prestar",
    endpoint: "POST /api/biblioteca/prestamos",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante (o persona del personal) que pide el libro." }],
    sinonimos: ["prestar un libro", "préstamo de libro", "sacar un libro", "registrar préstamo"],
    pasos: [
      LLEGAR,
      tab("prestar", "Prestar"),
      { narracion: "Escribe el nombre o documento de quien pide el libro y elígelo.", accion: "escribir", ancla: "biblioteca.buscar_lector", campo: "persona" },
      { narracion: "Escribe el número del libro (está en su etiqueta) y da Enter.", accion: "escribir", ancla: "biblioteca.codigo_prestar", campo: "libro" },
      { narracion: "Escoge la fecha en que debe devolverlo (viene sugerida a 15 días).", accion: "seleccionar", ancla: "biblioteca.fecha_devolucion", campo: "fecha" },
      { narracion: "Toca 'Prestar'.", accion: "click", ancla: "biblioteca.boton_prestar" },
    ],
  },
  {
    id: "biblioteca.devolver",
    titulo: "Recibir la devolución de un libro",
    descripcion: "Escribir el número del libro que devuelven. Si llegó tarde, avisa los días de retraso y la suspensión.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?seccion=devolver",
    endpoint: "POST /api/biblioteca/devoluciones",
    sinonimos: ["devolver un libro", "recibir libro", "devolución de libro"],
    pasos: [
      LLEGAR,
      tab("devolver", "Devolver"),
      { narracion: "Escribe el número del libro y da Enter. Puedes seguir con otro.", accion: "escribir", ancla: "biblioteca.codigo_devolver", campo: "libro" },
    ],
  },
  {
    id: "biblioteca.vencidos",
    titulo: "Ver los libros vencidos y quién los tiene",
    descripcion: "Lista de préstamos vencidos y perdidos sin reponer, los que están en préstamo y el historial. Quien gestiona renueva, marca perdidos y registra reposiciones.",
    categoria: "Biblioteca",
    roles: [...CONSULTAN],
    ruta: "/biblioteca?seccion=prestamos",
    endpoint: "GET /api/biblioteca/prestamos",
    sinonimos: ["libros vencidos", "quién debe libros", "libros sin devolver", "libro perdido", "renovar préstamo", "historial de préstamos"],
    pasos: [
      LLEGAR,
      tab("prestamos", "Préstamos"),
      { narracion: "Escoge 'Vencidos', 'En préstamo' o 'Historial'.", accion: "click", ancla: "biblioteca.prestamos_vistas" },
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
  {
    id: "biblioteca.paz_y_salvo",
    titulo: "Consultar el paz y salvo de biblioteca por salón",
    descripcion: "Ver qué estudiantes de un grado o salón deben libros (y cuáles) y descargarlo en Excel.",
    categoria: "Biblioteca",
    roles: [...CONSULTAN],
    ruta: "/biblioteca?seccion=paz",
    endpoint: "GET /api/biblioteca/paz-y-salvo",
    sinonimos: ["paz y salvo de biblioteca", "quién debe libros en un salón", "paz y salvo para matrícula", "paz y salvo para grado"],
    pasos: [
      LLEGAR,
      tab("paz", "Paz y salvo"),
      { narracion: "Elige el grado y, si quieres, el salón.", accion: "seleccionar", ancla: "biblioteca.paz_y_salvo", campo: "grado" },
    ],
  },
];
