import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
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

export interface ReordItem {
  /** Identificador estable de la tarjeta (se guarda en el orden). */
  id: string;
  /** Contenido de la tarjeta (su <button> tal cual, con su estilo propio). */
  render: ReactNode;
}

/** Una tarjeta arrastrable. El arrastre se activa con long-press (~0.5s); mientras
 *  `jiggling` está activo TODAS vibran menos la que se arrastra. La vibración va en
 *  un div interno para NO chocar con el transform de dnd-kit (que acomoda/mueve). */
function SortableCard({ id, jiggling, index, children }: { id: string; jiggling: boolean; index: number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const vibra = jiggling && !isDragging;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`normi-card touch-manipulation ${isDragging ? "scale-105" : ""}`}
      {...attributes}
      {...listeners}
    >
      <div
        className={`h-full ${vibra ? "normi-jiggle" : ""}`}
        style={vibra ? { animationDelay: index % 2 === 0 ? "0s" : "-0.13s" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Grilla de tarjetas reordenable estilo iPhone para cualquier dashboard.
 *
 * - Mantener presionada una tarjeta (~0.5s, el punto donde el celular da su vibración
 *   nativa) entra al "modo vibrar"; ahí se arrastra y al soltar se guarda — aunque
 *   quede en el mismo lugar. Un toque/clic normal navega.
 * - El orden se persiste por (user_id + colegio_id + dashboard) en Preferencias_Dashboard,
 *   así sigue a la persona entre dispositivos y NO se pisa con sus otros perfiles del
 *   mismo colegio (cada dashboard guarda con su propia `dashboardKey`).
 */
export default function ReordenableDashboard({ dashboardKey, items, gridClassName }: {
  dashboardKey: string;
  items: ReordItem[];
  gridClassName: string;
}) {
  const [orden, setOrden] = useState<string[]>([]);
  const [jiggling, setJiggling] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('Preferencias_Dashboard')
          .select('orden')
          .eq('user_id', String(session.id))
          .eq('dashboard', dashboardKey)
          .maybeSingle();
        if (data?.orden && Array.isArray(data.orden)) setOrden(data.orden as string[]);
      } catch { /* ignore */ }
    })();
  }, [dashboardKey]);

  // Aplicar el orden guardado: primero las que estén en `orden`, luego las nuevas
  // (no guardadas aún) al final, sin perder ninguna ni mostrar ids ya inexistentes.
  const byId = new Map(items.map((c) => [c.id, c]));
  const ordenadas: ReordItem[] = [
    ...orden.map((id) => byId.get(id)).filter((c): c is ReordItem => Boolean(c)),
    ...items.filter((c) => !orden.includes(c.id)),
  ];

  // Long-press ~0.5s para mover (evita arrastres accidentales con un toque).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
  );

  const handleDragStart = () => {
    setJiggling(true);
    // Vibración (haptic) al entrar al modo edición — Android (iOS ya vibra solo).
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setJiggling(false); // soltar SIEMPRE apaga la vibración (aunque no se mueva)
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = ordenadas.map((c) => c.id);
    const nuevoOrden = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    setOrden(nuevoOrden);
    // Guardar (el proxy inyecta colegio_id; el frontend manda user_id + dashboard).
    (async () => {
      try {
        const { error } = await supabase
          .from('Preferencias_Dashboard')
          .upsert(
            { user_id: String(getSession().id), dashboard: dashboardKey, orden: nuevoOrden },
            { onConflict: 'user_id,colegio_id,dashboard' },
          );
        if (error) console.error('Error guardando el orden del dashboard:', error);
      } catch (e) {
        console.error('Error guardando el orden del dashboard:', e);
      }
    })();
  };

  return (
    <>
      <p className="text-xs text-muted-foreground mb-6 text-center">
        Mantén presionada una tarjeta para cambiar su posición.
      </p>

      <style>{`@keyframes normiJiggle{0%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}100%{transform:rotate(-1.4deg)}}.normi-jiggle{animation:normiJiggle .22s ease-in-out infinite;transform-origin:50% 50%}.normi-card{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}.normi-card img{-webkit-user-drag:none;pointer-events:none}`}</style>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setJiggling(false)}>
        <SortableContext items={ordenadas.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className={gridClassName}>
            {ordenadas.map((item, idx) => (
              <SortableCard key={item.id} id={item.id} jiggling={jiggling} index={idx}>
                {item.render}
              </SortableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
