// Catálogo "Normi te guía" — Módulo BIBLIOTECA (ficha Biblioteca, 2026-10-04).
//
// Una ficha para todos los perfiles (/biblioteca, pestañas por ?tab=):
//  - Todos: Catálogo (búsqueda y disponibilidad) y Mis préstamos (el acudiente: los de sus hijos).
//  - Bibliotecario(a) y Administrador: Prestar y devolver (escáner USB o cámara), Préstamos
//    (vencidos, renovar, perdido/repuesto), Etiquetas (PDF), Paz y salvo, Reglas.
//  - Rector, coordinación, secretaría y administrativos: Préstamos y Paz y salvo (solo ver) y
//    Reglas (el rector las puede cambiar).

import type { Capacidad } from "../tipos";

const LLEGAR = { narracion: "En el inicio, toca la ficha Biblioteca.", accion: "click" as const, ancla: "dashboard.ficha_biblioteca" };
const tab = (k: string, nombre: string) => ({ narracion: `Toca la pestaña '${nombre}'.`, accion: "click" as const, ancla: `biblioteca.tab_${k}` });
const TODOS = ["profesor", "rector", "coordinador", "secretaria", "administrativo", "orientador", "portero", "bibliotecario", "admin", "estudiante", "acudiente"] as const;
const GESTIONAN = ["bibliotecario", "admin"] as const;
const CONSULTAN = ["bibliotecario", "admin", "rector", "coordinador", "secretaria", "administrativo"] as const;

export const BIBLIOTECA: Capacidad[] = [
  {
    id: "biblioteca.buscar_libro",
    titulo: "Buscar un libro en la biblioteca y ver si está disponible",
    descripcion: "Buscar en el catálogo por título, autor, materia o ISBN y ver cuántas copias hay disponibles o cuándo vuelve el libro.",
    categoria: "Biblioteca",
    roles: [...TODOS],
    ruta: "/biblioteca?tab=catalogo",
    endpoint: "GET /api/biblioteca/catalogo",
    sinonimos: ["buscar un libro", "hay tal libro en la biblioteca", "está disponible el libro", "catálogo de la biblioteca", "qué libros hay"],
    pasos: [
      LLEGAR,
      tab("catalogo", "Catálogo"),
      { narracion: "Escribe el título, el autor o la materia.", accion: "escribir", ancla: "biblioteca.buscar", campo: "busqueda" },
      { narracion: "Cada libro dice si está disponible o cuándo vuelve. Tócalo para ver el detalle.", accion: "explicar", ancla: "biblioteca.catalogo" },
    ],
  },
  {
    id: "biblioteca.mis_prestamos",
    titulo: "Ver mis libros prestados y renovarlos",
    descripcion: "Ver qué libros tiene prestados, hasta cuándo, y renovarlos en línea si aún no vencen. El acudiente ve los de cada hijo y si están a paz y salvo.",
    categoria: "Biblioteca",
    roles: [...TODOS],
    ruta: "/biblioteca?tab=mis",
    endpoint: "GET /api/biblioteca/mis-prestamos",
    sinonimos: ["mis libros prestados", "cuándo devuelvo el libro", "renovar un libro", "libros de mi hijo", "paz y salvo de biblioteca de mi hijo"],
    pasos: [
      LLEGAR,
      { narracion: "Toca la pestaña de préstamos ('Mis préstamos' o 'Préstamos de mis hijos').", accion: "click", ancla: "biblioteca.tab_mis" },
      { narracion: "Aquí ves cada libro y la fecha de devolución; con 'Renovar' amplías el plazo si todavía no ha vencido.", accion: "explicar", ancla: "biblioteca.mis_prestamos" },
    ],
  },
  {
    id: "biblioteca.agregar_libro",
    titulo: "Agregar libros al catálogo de la biblioteca",
    descripcion: "Catalogar un libro: con el ISBN se llenan solos los datos (si existen), se eligen género y nivel, y se crean sus copias con número de inventario.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?tab=catalogo",
    endpoint: "POST /api/biblioteca/obras",
    sinonimos: ["agregar un libro", "catalogar libros", "registrar libros nuevos", "numerar los libros", "inventario de libros"],
    pasos: [
      LLEGAR,
      tab("catalogo", "Catálogo"),
      { narracion: "Toca 'Agregar libro'.", accion: "click", ancla: "biblioteca.agregar_libro" },
      { narracion: "Escribe o escanea el ISBN y toca la lupa: si el libro existe en internet, los datos se llenan solos.", accion: "escribir", ancla: "biblioteca.form_isbn", campo: "isbn", opcional: true },
      { narracion: "Revisa el título y elige el género: con él se arma la signatura del lomo.", accion: "seleccionar", ancla: "biblioteca.form_genero", campo: "genero" },
      { narracion: "Indica cuántas copias tienes; cada una recibe su número de inventario.", accion: "escribir", ancla: "biblioteca.form_cantidad", campo: "cantidad" },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "biblioteca.form_guardar" },
    ],
  },
  {
    id: "biblioteca.prestar",
    titulo: "Prestar un libro",
    descripcion: "Buscar a la persona, escanear el libro (lector de códigos o cámara) y prestarlo. Si tiene libros vencidos o perdidos, o está suspendida, no deja prestar.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?tab=mostrador",
    endpoint: "POST /api/biblioteca/prestamos",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante (o persona del personal) que pide el libro." }],
    sinonimos: ["prestar un libro", "préstamo de libro", "sacar un libro", "registrar préstamo"],
    pasos: [
      LLEGAR,
      tab("mostrador", "Prestar y devolver"),
      { narracion: "Con 'Prestar' seleccionado, escribe el nombre o documento de quien pide el libro y elígelo.", accion: "escribir", ancla: "biblioteca.buscar_lector", campo: "persona" },
      { narracion: "Escanea el código del libro con el lector o con 'Cámara', o escribe su número y da Enter.", accion: "escribir", ancla: "biblioteca.codigo_prestar", campo: "libro" },
      { narracion: "Toca 'Prestar'. Te muestra la fecha de devolución.", accion: "click", ancla: "biblioteca.boton_prestar" },
    ],
  },
  {
    id: "biblioteca.devolver",
    titulo: "Recibir la devolución de un libro",
    descripcion: "Escanear el libro que devuelven. Si llegó tarde, avisa los días de retraso y la suspensión.",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?tab=mostrador",
    endpoint: "POST /api/biblioteca/devoluciones",
    sinonimos: ["devolver un libro", "recibir libro", "devolución de libro"],
    pasos: [
      LLEGAR,
      tab("mostrador", "Prestar y devolver"),
      { narracion: "Toca 'Devolver'.", accion: "click", ancla: "biblioteca.modo_devolver" },
      { narracion: "Escanea el código del libro (o escribe su número y da Enter). Puedes seguir escaneando uno tras otro.", accion: "escribir", ancla: "biblioteca.codigo_devolver", campo: "libro" },
    ],
  },
  {
    id: "biblioteca.vencidos",
    titulo: "Ver los libros vencidos y quién los tiene",
    descripcion: "Lista de préstamos vencidos y perdidos sin reponer, los que están en préstamo y el historial. Quien gestiona renueva, marca perdidos y registra reposiciones.",
    categoria: "Biblioteca",
    roles: [...CONSULTAN],
    ruta: "/biblioteca?tab=prestamos",
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
    descripcion: "PDF tamaño carta con el código de barras de cada libro (30 por hoja) o el tejuelo del lomo con el color del género y del nivel (80 por hoja).",
    categoria: "Biblioteca",
    roles: [...GESTIONAN],
    ruta: "/biblioteca?tab=etiquetas",
    endpoint: "GET /api/biblioteca/etiquetas",
    sinonimos: ["etiquetar libros", "imprimir códigos de barras", "tejuelos", "etiquetas del lomo", "rotular libros"],
    pasos: [
      LLEGAR,
      tab("etiquetas", "Etiquetas"),
      { narracion: "Elige el tipo de etiqueta y cuáles libros; si la hoja ya está usada, indica en qué etiqueta empezar.", accion: "explicar", ancla: "biblioteca.etiquetas" },
      { narracion: "Toca 'Generar PDF' e imprímelo en papel adhesivo sin ajustar a la página.", accion: "click", ancla: "biblioteca.generar_etiquetas" },
    ],
  },
  {
    id: "biblioteca.paz_y_salvo",
    titulo: "Consultar el paz y salvo de biblioteca por salón",
    descripcion: "Ver qué estudiantes de un grado o salón deben libros (y cuáles) y descargarlo en Excel.",
    categoria: "Biblioteca",
    roles: [...CONSULTAN],
    ruta: "/biblioteca?tab=paz",
    endpoint: "GET /api/biblioteca/paz-y-salvo",
    sinonimos: ["paz y salvo de biblioteca", "quién debe libros en un salón", "paz y salvo para matrícula", "paz y salvo para grado"],
    pasos: [
      LLEGAR,
      tab("paz", "Paz y salvo"),
      { narracion: "Elige el grado y, si quieres, el salón.", accion: "seleccionar", ancla: "biblioteca.paz_y_salvo", campo: "grado" },
    ],
  },
  {
    id: "biblioteca.reglas",
    titulo: "Cambiar las reglas de préstamo de la biblioteca",
    descripcion: "Cuántos libros y por cuántos días puede llevar cada tipo de persona, cuántas renovaciones, y si al devolver tarde queda suspendido. No hay multas en dinero.",
    categoria: "Biblioteca",
    roles: ["bibliotecario", "admin", "rector"],
    ruta: "/biblioteca?tab=config",
    endpoint: "PUT /api/biblioteca/config",
    sinonimos: ["reglas de préstamo", "cuántos libros puede llevar", "días de préstamo", "suspensión por retraso", "multas de biblioteca"],
    pasos: [
      LLEGAR,
      tab("config", "Reglas"),
      { narracion: "Ajusta los libros a la vez y los días para estudiantes, profesores y demás personal, y toca 'Guardar'.", accion: "explicar", ancla: "biblioteca.config" },
    ],
  },
];
