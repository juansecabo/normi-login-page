import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isAdmin } from "@/hooks/useSession";
import { ClipboardList, MessageCircleQuestion } from "lucide-react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import iconNotas from "@/assets/icons/notas.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconEnviarComunicado from "@/assets/icons/enviar-comunicado.webp";
import iconPanelControl from "@/assets/icons/panel-de-control.webp";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconUsoAgente from "@/assets/icons/uso-agente.webp";
import iconSugerencias from "@/assets/icons/sugerencias.webp";
import iconConversaciones from "@/assets/icons/conversaciones.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import AvatarUploader from "@/components/AvatarUploader";
import { getAllLastSeen } from "@/utils/notificaciones";

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm z-10 animate-badge-pop">
      {count > 99 ? '99+' : count}
    </span>
  );
};

interface CardDef {
  id: string;
  label: string;
  bg: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
}

/** Clave de localStorage del orden del dashboard, por usuario Y por colegio. */
function ordenKey(): string {
  const s = getSession();
  return `normi_dash_orden_admin_${s.id}_${s.colegio_id}`;
}

/** Una tarjeta arrastrable (long-press en móvil / arrastrar en desktop). */
function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`touch-manipulation ${isDragging ? "scale-105" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

const DashboardAdmin = () => {
  const navigate = useNavigate();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [badges, setBadges] = useState({ retiro: 0, inasistencia: 0, uniforme: 0 });
  const [orden, setOrden] = useState<string[]>([]);

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
      navigate("/");
      return;
    }

    if (!isAdmin()) {
      navigate("/dashboard");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");

    // Cargar el orden personalizado guardado (por usuario + colegio).
    try {
      const saved = localStorage.getItem(ordenKey());
      if (saved) setOrden(JSON.parse(saved));
    } catch { /* ignore */ }

    const fetchBadges = async () => {
      try {
        const lastSeen = await getAllLastSeen(session.id!);
        const [retiroRes, inasistenciaRes, uniformeRes] = await Promise.all([
          supabase.from('Autorizaciones_Retiro').select('*', { count: 'exact', head: true }).gt('id', lastSeen['retiro'] ?? 0),
          supabase.from('Justificaciones_Inasistencia').select('*', { count: 'exact', head: true }).gt('id', lastSeen['inasistencia'] ?? 0),
          supabase.from('Justificaciones_Uniforme').select('*', { count: 'exact', head: true }).gt('id', lastSeen['uniforme'] ?? 0),
        ]);
        setBadges({
          retiro: retiroRes.count ?? 0,
          inasistencia: inasistenciaRes.count ?? 0,
          uniforme: uniformeRes.count ?? 0,
        });
      } catch (err) {
        console.error('Error fetching badges:', err);
      }
    };
    fetchBadges();
  }, [navigate]);

  const permisosTotal = badges.retiro + badges.inasistencia + badges.uniforme;

  // Definición de todas las tarjetas (orden por defecto).
  const cards: CardDef[] = [
    { id: 'notas', label: 'Notas', bg: 'bg-emerald-100 hover:bg-emerald-200', icon: <img src={iconNotas} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/rector/seleccionar-grado") },
    { id: 'estadisticas', label: 'Estadísticas', bg: 'bg-green-100 hover:bg-green-200', icon: <img src={iconEstadisticas} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/rector/estadisticas") },
    { id: 'enviar-comunicado', label: 'Enviar Comunicado', bg: 'bg-teal-100 hover:bg-teal-200', icon: <img src={iconEnviarComunicado} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/enviar-comunicado-admin") },
    { id: 'todas-actividades', label: 'Todas las Actividades', bg: 'bg-emerald-100 hover:bg-emerald-200', icon: <img src={iconActividades} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/admin/todas-actividades") },
    { id: 'panel-control', label: 'Panel de Control', bg: 'bg-purple-100 hover:bg-purple-200', icon: <img src={iconPanelControl} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/rector/panel-control") },
    { id: 'sugerencias', label: 'Sugerencias', bg: 'bg-amber-100 hover:bg-amber-200', icon: <img src={iconSugerencias} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/admin/sugerencias") },
    { id: 'uso-normi', label: 'Uso de Normi', bg: 'bg-orange-100 hover:bg-orange-200', icon: <img src={iconUsoAgente} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/rector/uso-normi") },
    { id: 'registro-normi', label: 'Registro en Normi', bg: 'bg-cyan-100 hover:bg-cyan-200', icon: <img src={iconRegistroAgente} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/registro-normi") },
    { id: 'conversaciones', label: 'Conversaciones', bg: 'bg-blue-100 hover:bg-blue-200', icon: <img src={iconConversaciones} alt="" className="w-16 h-16 object-contain" />, onClick: () => window.open("https://chat.notasnormi.com", "_blank") },
    { id: 'permisos-excusas', label: 'Permisos y Excusas', bg: 'bg-rose-100 hover:bg-rose-200', icon: <img src={iconPermisos} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/permisos-excusas"), badge: permisosTotal },
    { id: 'consultas', label: 'Consultas', bg: 'bg-pink-100 hover:bg-pink-200', icon: <img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/consultas") },
    { id: 'registros-comportamiento', label: 'Registros de Comportamiento', bg: 'bg-amber-100 hover:bg-amber-200', icon: <img src={iconRegistros} alt="" className="w-16 h-16 object-contain" />, onClick: () => navigate("/registros-comportamiento") },
    { id: 'solicitudes-registro', label: 'Solicitudes de Registro', bg: 'bg-sky-100 hover:bg-sky-200', icon: <ClipboardList className="w-16 h-16 text-sky-700" strokeWidth={1.5} />, onClick: () => navigate("/admin/correcciones-registro") },
    { id: 'dudas-personal', label: 'Dudas del Personal', bg: 'bg-violet-100 hover:bg-violet-200', icon: <MessageCircleQuestion className="w-16 h-16 text-violet-700" strokeWidth={1.5} />, onClick: () => navigate("/admin/dudas") },
  ];

  // Aplicar el orden guardado: primero las que estén en `orden`, luego las que
  // no estén (funciones nuevas) al final, sin perder ninguna.
  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordenadas: CardDef[] = [
    ...orden.map((id) => byId.get(id)).filter((c): c is CardDef => Boolean(c)),
    ...cards.filter((c) => !orden.includes(c.id)),
  ];

  const sensors = useSensors(
    // Desktop: arrastrar tras mover 8px (un clic normal navega).
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Móvil: mantener presionado 250ms para arrastrar (un toque normal navega).
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = ordenadas.map((c) => c.id);
    const nuevoOrden = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    setOrden(nuevoOrden);
    try { localStorage.setItem(ordenKey(), JSON.stringify(nuevoOrden)); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-admin" />

      <main className="flex-1 container mx-auto p-8">
        <EncabezadoColegio />
        <div className="relative max-w-2xl mx-auto">
          <div className="bg-card rounded-lg shadow-soft p-8 text-center">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-4">
              Bienvenido(a)
            </h2>
            <p className="text-xl text-primary font-semibold">
              {nombres} {apellidos}
            </p>
            <p className="text-muted-foreground mt-2">
              Administrador
            </p>
          </div>
          <div className="hidden xl:block absolute top-1/2 -translate-y-1/2 left-full ml-10">
            <AvatarUploader />
          </div>
          <div className="xl:hidden flex justify-center mt-4">
            <AvatarUploader />
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-1 text-center">
            ¿Qué deseas consultar?
          </h3>
          <p className="text-xs text-muted-foreground mb-6 text-center">
            Mantén presionada una tarjeta para moverla y ordenarlas a tu gusto.
          </p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ordenadas.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 max-w-5xl mx-auto">
                {ordenadas.map((card) => (
                  <SortableCard key={card.id} id={card.id}>
                    <button
                      onClick={card.onClick}
                      className={`relative w-full h-full flex flex-col items-center justify-center gap-4 p-8 rounded-lg ${card.bg} transition-all duration-200 hover:shadow-md`}
                    >
                      {card.badge ? <Badge count={card.badge} /> : null}
                      {card.icon}
                      <span className="font-semibold text-lg text-foreground text-center">{card.label}</span>
                    </button>
                  </SortableCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex items-start justify-center gap-8 mt-8">
          <button
            onClick={() => navigate("/manual-convivencia")}
            className="flex flex-col items-center gap-2 transition-all duration-200 hover:scale-105"
          >
            <img
              src="/manual-de-convivencia.webp"
              alt="Manual de Convivencia"
              className="w-20 h-20 object-contain"
            />
            <span className="font-semibold text-foreground text-sm">
              Manual de Convivencia
            </span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default DashboardAdmin;
