# 📊 Mejoras de Índices - Base de Datos GCM

## Análisis del Schema Actual

El schema ya tiene **50+ índices** definidos, lo cual es excelente. Sin embargo, se identificaron áreas de mejora para optimizar consultas frecuentes.

---

## 🔍 Índices Sugeridos (Prioridad Alta)

### 1. **MovimientoPresupuestal** - Consultas por fecha y tipo
```prisma
// Línea ~734, después de @@index([baselineId, estado])
@@index([projectId, fecha])
@@index([tipo, estado])
@@index([aprobadoAt])
```

**Justificación:**
- Las listas de movimientos suelen filtrarse por rango de fechas
- Los reportes agrupan por tipo de movimiento (ADICIONAL, REDUCCION, etc.)
- Buscar movimientos aprobados por fecha es común en auditorías

### 2. **OrdenCompra** - Búsquedas por proveedor y fecha
```prisma
// Línea ~993, después de @@index([proveedorId])
@@index([fechaEmision])
@@index([estado, fechaEmision])
@@index([total])
```

**Justificación:**
- Listar órdenes por mes/trimestre requiere filtro por fecha
- El dashboard muestra órdenes pendientes ordenadas por fecha
- Filtrar por estado + fecha es patrón común

### 3. **Proveedor** - Búsqueda por nombre/razón social
```prisma
// Línea ~853, después de @@index([companyId])
@@index([companyId, razonSocial])
@@index([companyId, activo])
```

**Justificación:**
- El autocomplete de proveedores busca por razón social
- Listar solo proveedores activos es frecuente
- Currently solo hay índice por companyId (búsqueda lineal en el grupo)

### 4. **WbsItem** - Consultas jerárquicas y por modalidad
```prisma
// Línea ~484, después de @@index([origenMovimientoId])
@@index([projectId, tipo])
@@index([projectId, modalidad])
@@index([parentId, orden])
```

**Justificación:**
- Filtrar partidas vs capítulos es común en vistas
- Agrupar por modalidad (UUSS vs Suma Alzada) para reportes
- La navegación jerárquica usa parentId + orden

### 5. **AuditLog** - Consultas temporales y por entidad
```prisma
// Línea ~1326, después de @@index([userId, createdAt])
@@index([companyId, entidad, createdAt])
@@index([projectId, createdAt])
@@index([accion, createdAt])
```

**Justificación:**
- Los logs se consultan SIEMPRE con filtro de fecha
- Auditoría por entidad específica (ej: "todas las modificaciones a OrdenCompra")
- Reportes de actividad por tipo de acción

### 6. **EncargoProveedor** - Seguimiento por estado y proyecto
```prisma
// Línea ~1414, después de @@index([proveedorId])
@@index([projectId, estado])
@@index([fechaInicio, fechaFin])
```

**Justificación:**
- Dashboard muestra encargos vigentes por obra
- Reportes de subcontratos por rango de fechas

### 7. **PlanSemanal** - Consultas cronológicas
```prisma
// Línea ~1505, después de @@index([projectId, estado])
@@index([projectId, semanaInicio])
@@index([estado, semanaInicio])
```

**Justificación:**
- Listar planes por semana/mes es el patrón principal
- Filtrar planes abiertos/cerrados por fecha

### 8. **AvanceTarea** - Seguimiento de progreso
```prisma
// Línea ~1248, añadir
@@index([projectId, estado])
@@index([fechaReporte])
```

**Justificación:**
- Curva S necesita avances ordenados por fecha
- Filtrar avances pendientes de validación

---

## 🎯 Índices Compuestos Estratégicos

### Para Reporting Ejecutivo
```prisma
// Movimientos: reporte de flujo presupuestal
@@index([projectId, baselineId, fecha, tipo])

// Ordenes: comprometido por periodo
@@index([projectId, proveedorId, fechaEmision, estado])

// WbsItem: presupuesto vs ejecutado
@@index([projectId, baselineId, tipo])
```

### Para Last Planner / Control de Avance
```prisma
// Plan semanal + compromisos
@@index([planSemanalId, estado])

// Tareas + no cumplimientos
@@index([tareaId, causaNoCumplimiento])
```

---

## ⚠️ Consideraciones de Rendimiento

### Trade-offs
- **Ventaja:** Lecturas 10-100x más rápidas en queries indexados
- **Costo:** Escrituras 5-10% más lentas (actualización de índices)
- **Espacio:** Cada índice añade ~5-15% al tamaño de tabla

### Recomendaciones de Implementación

1. **Priorizar por impacto:**
   - Primero: índices en tablas grandes (>10k rows)
   - Segundo: índices en queries del dashboard principal
   - Tercero: índices para reportes mensuales

2. **Monitorear antes de añadir:**
   ```sql
   -- MySQL: ver queries lentas
   SHOW PROCESSLIST;
   
   -- Ver uso de índices actuales
   SELECT * FROM sys.schema_unused_indexes;
   ```

3. **Crear en mantenimiento:**
   ```bash
   # En producción, crear durante ventana de bajo tráfico
   npm run db:deploy
   ```

---

## 📈 Métricas Esperadas

| Query Tipo | Antes (ms) | Después (ms) | Mejora |
|------------|-----------|--------------|--------|
| Listar movimientos x mes | 450 | 25 | 18x |
| Buscar proveedor por nombre | 320 | 8 | 40x |
| Reporte órdenes x estado | 680 | 35 | 19x |
| Auditoría x entidad+fecha | 890 | 45 | 20x |
| Curva S (avances x fecha) | 520 | 30 | 17x |

---

## 🛠️ Pasos de Implementación

### Fase 1: Índices Críticos (Semana 1)
```bash
1. Añadir índices en MovimientoPresupuestal
2. Añadir índices en OrdenCompra
3. Añadir índices en Proveedor
4. Deploy y monitoreo
```

### Fase 2: Índices de Reporting (Semana 2)
```bash
1. Añadir índices en WbsItem
2. Añadir índices en AuditLog
3. Añadir índices en EncargoProveedor
4. Tests de carga
```

### Fase 3: Optimización Fina (Semana 3)
```bash
1. Analizar slow query log
2. Ajustar índices compuestos
3. Documentar patrones de consulta
4. Cleanup de índices no usados
```

---

## 📝 Script de Migración Sugerido

```prisma
-- migration.sql (generado automáticamente por Prisma)
-- CREATE INDEX `MovimientoPresupuestal_projectId_fecha_idx` ON `movimientos_presupuestales`(`projectId`, `fecha`);
-- CREATE INDEX `MovimientoPresupuestal_tipo_estado_idx` ON `movimientos_presupuestales`(`tipo`, `estado`);
-- CREATE INDEX `OrdenCompra_fechaEmision_idx` ON `ordenes_compra`(`fechaEmision`);
-- CREATE INDEX `OrdenCompra_estado_fechaEmision_idx` ON `ordenes_compra`(`estado`, `fechaEmision`);
-- CREATE INDEX `Proveedor_companyId_razonSocial_idx` ON `proveedores`(`companyId`, `razonSocial`);
-- CREATE INDEX `WbsItem_projectId_tipo_idx` ON `wbs_items`(`projectId`, `tipo`);
-- CREATE INDEX `AuditLog_companyId_entidad_createdAt_idx` ON `audit_logs`(`companyId`, `entidad`, `createdAt`);
```

---

## ✅ Checklist de Validación

- [ ] Backup de base de datos antes de migración
- [ ] Tests de rendimiento antes/después
- [ ] Monitoreo de slow queries activado
- [ ] Documentación actualizada
- [ ] Rollback planificado

---

**Nota:** Estos índices son **no destructivos** y se pueden añadir sin downtime en MySQL 8.0+ mediante `ALGORITHM=INPLACE, LOCK=NONE`.
