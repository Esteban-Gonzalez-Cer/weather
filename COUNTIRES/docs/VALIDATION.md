# Validación local · Orbe

Fecha: 28 de octubre de 2026. Entorno: macOS ARM64, Python 3.13.5, Node.js 26.4.0. Los procesos y los entornos virtuales pertenecen a COUNTIRES.

## Comprobaciones automatizadas

`sh scripts/test.sh`: **86 pruebas aprobadas** y compilación Vite de producción correcta.

| Área | Resultado | Alcance |
|---|---|---|
| Backend | 31 pruebas | Autenticación requerida, JWT RSA/EC, certificados macOS, errores saneados, filtros, validación de parámetros, privacidad de jobs y CORS del nuevo frontend |
| Pipeline | 26 pruebas | Formato v5, paginación completa, códigos duplicados, muestra demo rechazada, valores nulos/cero, errores de proveedor, descarga PNG, credenciales separadas y parseo de los dos DAGs |
| React | 18 pruebas | Sesión/PKCE/logout, API autenticada, búsqueda, regiones, paginación, cancelación de respuestas antiguas, estados vacíos/pendientes, modal, Escape, foco y errores recuperables |
| PostgreSQL embebido | 11 pruebas | Migración real en PGlite, RLS con dos usuarios simulados, permisos de publicación, búsquedas con acentos, transacciones, duplicados, recuperación, límites de intentos y limpieza |
| Producción frontend | Correcto | Vite compila la aplicación; los fixtures `qa/` no forman parte de `dist/` |

Hay una advertencia de deprecación de Starlette sobre su adaptador de pruebas con HTTPX. No hace fallar las pruebas ni se observó un fallo de ejecución de la aplicación.

## Arranque local

- FastAPI, puerto **8001**: `/health` devolvió HTTP 200; `/api/v1/countries` sin token devolvió HTTP 401.
- Airflow, puerto **8081**: `/api/v2/monitor/health` devolvió HTTP 200, con metadata, scheduler, DAG processor y triggerer saludables. Se configuraron puertos de logs **8893/8894** y la API de ejecución del nuevo servicio.
- Se usaron `scripts/smoke_local.py backend` y `scripts/smoke_local.py pipeline`; detuvieron sus propios procesos al terminar.
- Las restricciones del entorno de ejecución bloquearon inicialmente la apertura de puertos locales. Los checks se repitieron con autorización de acceso local y aprobaron; no se trataba de un fallo de la aplicación.

## Comprobaciones visuales y de interacción

Se abrió `frontend/qa/` en el navegador integrado con los componentes reales de catálogo/modal y datos de ejemplo claramente etiquetados. No se utilizó una sesión real ni se consultó una base remota.

| Tamaño | Resultado |
|---|---|
| 1440 × 1000 | Cuatro columnas, composición con globo, búsqueda/filtros y modal de escritorio. Ancho del documento: 1440; sin desbordamiento horizontal. |
| 768 × 1024 | Tres columnas y filtros reorganizados. Ancho del documento: 768; sin desbordamiento horizontal. |
| 360 × 800 | Dos columnas, filtros adaptados y modal apilado con scroll interno. Ancho del documento: 360; sin desbordamiento horizontal. El botón de cerrar sigue visible al desplazar el contenido del modal. |

Se comprobó buscar `méxico` con acento, seleccionar Europa y obtener las cuatro tarjetas europeas del fixture, abrir México y cerrar con Escape. Se revisó que las doce imágenes se cargaron como PNG `data:` a partir de los campos guardados; no hay URLs de proveedor en las imágenes. Las pruebas del cliente confirman que sus consultas se dirigen a FastAPI y las del backend confirman que sólo se consulta Supabase.

Capturas de la **vista de prueba**, con cifras ilustrativas:

- [Catálogo de escritorio](catalog-desktop.png)
- [Catálogo en tablet](catalog-tablet.png)
- [Detalle de escritorio](country-modal-desktop.png)
- [Catálogo móvil](catalog-mobile.png)
- [Detalle móvil](country-modal-mobile.png)
- [Acceso en escritorio](sign-in-desktop.png)
- [Acceso móvil](sign-in-mobile.png)

Se revisó también la pantalla principal sin configuración: el acceso con Google queda deshabilitado y explica que falta conectar el nuevo proyecto Supabase. No se muestra un catálogo ficticio en la aplicación principal.

## Verificación del proveedor

Se consultaron la documentación oficial vigente de REST Countries v5 y su respuesta pública demo para confirmar el formato `data.objects` / `data.meta`, nombres, códigos, idiomas y monedas. Se descargaron banderas del CDN oficial para los fixtures visuales. Esto **no** demuestra una descarga del catálogo completo con una clave privada propia ni una publicación en Supabase.

La implementación rechaza la clave/respuesta demo, valida el total de la paginación y no publica catálogos incompletos. Una clave propia se configura únicamente en `pipeline/.env`.

## Integraciones pendientes de configurar y probar

No se crearon cuentas externas ni se reutilizaron credenciales de WEATHER. No se aplicó la migración a un proyecto remoto.

Con el nuevo proyecto Supabase, Google OAuth y REST Countries configurados, falta verificar en vivo:

1. Login Google, callback, restauración y logout en el nuevo proyecto.
2. Primera carga completa: cola → Airflow → REST Countries/banderas → publicación en Supabase.
3. Lecturas reales del catálogo, búsquedas, filtros y modal.
4. Dos usuarios reales y aislamiento de sus jobs mediante RLS remoto.
5. Pestaña de red del navegador durante el flujo autenticado: cero solicitudes del frontend a REST Countries o a su CDN.

Las pruebas con tokens firmados de fixture, roles PostgreSQL locales y pantallas de QA no sustituyen estas verificaciones externas.

## Diagnóstico de la carga real y correcciones

Se verificaron el proveedor y la base remota configurados durante la investigación del fallo de ingestión:

- REST Countries devolvió 254 registros. Cuatro tenían ambos códigos ISO vacíos; la validación anterior rechazaba el catálogo completo. Ahora se contabilizan y excluyen esos registros fuera del modelo basado en códigos, y se siguen rechazando registros malformados, páginas incompletas y duplicados.
- Se descargaron y validaron correctamente los 250 registros compatibles y sus 250 banderas reales.
- El scheduler recibía una respuesta vacía exitosa de su función SQL `void`, pero el adaptador intentaba interpretarla como JSON y registraba un falso fallo de conexión. Se corrigió ese manejo.
- La publicación remota devolvió HTTP 400, código PostgreSQL `21000`, mensaje `DELETE requires a WHERE clause`. La migración `002_safe_catalog_publication.sql` reemplaza la función con una eliminación explícita `WHERE true` dentro de la misma transacción. No desactiva la protección ni cambia permisos y no borra registros al aplicar la migración.
- Las cargas fallidas ahora hacen fallar la tarea de Airflow, además de registrar el error del job. Los reintentos del procesamiento pertenecen a la cola; el task no reintenta un fallo permanente para terminar después como un falso éxito sin trabajo.
- Tras confirmar el usuario la aplicación de `002`, se ejecutó la carga real completa: se publicaron **250 países**. La consulta independiente a `countries` confirmó un total de 250 filas y recuperó CAN, JPN y MEX. `catalog_state` devolvió `country_count=250`, `status=idle`, `last_error=null` y `last_success_at=2026-10-28T16:24:15.669132+00:00`.
- La validación de esta corrección aprobó **34 pruebas del pipeline y 11 pruebas de base de datos** sobre ambas migraciones. Esta verificación demuestra la ingestión real al proyecto configurado; no sustituye las comprobaciones de Google OAuth y RLS con dos sesiones reales descritas anteriormente.
