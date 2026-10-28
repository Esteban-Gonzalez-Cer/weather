# Verificación de la implementación

Fecha: 23 de octubre de 2026. Ejecución local en macOS ARM64, Python 3.13 y Node 26.

| Comprobación | Resultado |
| --- | --- |
| FastAPI y autenticación JWT | 23 pruebas aprobadas |
| Transformación y pipeline | 16 pruebas aprobadas |
| React, OAuth simulado y presentación | 17 pruebas aprobadas |
| Migración, permisos y transacciones en PostgreSQL embebido | 6 pruebas aprobadas |
| Total automatizado | **62 pruebas aprobadas** |
| Compilación de producción de Vite | Aprobada; la página `/qa/` no se incluye |
| FastAPI iniciado como proceso local real | `/health` responde HTTP 200; lectura sin sesión responde HTTP 401 |
| Airflow 3.3.2 iniciado como proceso local real | API HTTP 200 y estados saludables de metadatos, scheduler, DAG processor y triggerer |
| Carga local de DAGs | Los dos DAGs se importan sin errores |
| Dependencias de Airflow | `pip check` sin incompatibilidades |
| Aislamiento del trabajo | `COUNTIRES` sigue vacío |

El runner `sh scripts/test.sh` reproduce las pruebas y la compilación. `python3 scripts/smoke_local.py backend` y `python3 scripts/smoke_local.py pipeline` inician y detienen sus propios procesos de comprobación. Se corrigió el lanzador para que Airflow encuentre sus ejecutables secundarios en la `.venv`.

## Pruebas visuales

Se revisó el componente real del dashboard en una página aislada con **datos ficticios señalados explícitamente**:

- **1440 × 1100**: dos columnas, tarjeta principal, pronóstico de tres días y métricas laterales. Ancho del documento: 1440 px.
- **768 × 1024**: contenido principal apilado y detalles en dos columnas. Ancho del documento: 768 px.
- **360 × 900**: tarjetas apiladas, condiciones legibles y desplazamiento contenido para horas y UV. Ancho del documento: 360 px.

En ninguno de esos tamaños hubo desbordamiento horizontal de la página. Se seleccionó otro día y se verificó el cambio a detalles de **Pronóstico**; la observación principal permaneció en **Ahora**. Se inspeccionaron brújula, ráfagas, astronomía, iluminación lunar, UV horario y destinos recientes. También se comprobó la bienvenida real sin credenciales, que muestra las instrucciones de configuración.

[Escritorio](preview-desktop.png) · [Tablet](preview-tablet.png) · [Móvil](preview-mobile.png)

## Qué prueban los resultados

Las pruebas de JWT generan firmas RSA reales y rechazan tokens vencidos, emisores/audiencias incorrectos, identificadores inválidos, roles indebidos y firmas distintas. Las pruebas de OAuth del frontend simulan el servicio y verifican restauración, renovación, salida y el intercambio PKCE único bajo StrictMode.

Las pruebas SQL ejecutan la migración real sobre PostgreSQL embebido con roles y `auth.uid()` de prueba. Verifican aislamiento de usuarios, denegación de escrituras y funciones privilegiadas, publicación atómica, conservación del pronóstico tras una excepción, ausencia de duplicados, caché, arrendamientos vencidos, reintentos y seguimiento de ciudades durante 24 horas.

Los fixtures del proveedor comprueban días locales, cambios de horario de 23/25 horas, horas incompletas o repetidas, campos fuera de rango, valores ausentes y sanitización de errores. Las pruebas del cliente frontend verifican que las búsquedas se dirigen a FastAPI con el token de Supabase y que una respuesta 401 elimina la sesión local.

## Límites y comprobaciones pendientes

**No se han creado ni configurado cuentas externas.** Por tanto, siguen pendientes:

1. Aplicar la migración al proyecto Supabase real y verificar su Data API/PostgREST.
2. Completar un inicio/cierre de sesión real con Google y las redirecciones configuradas.
3. Ingerir una búsqueda y un pronóstico reales desde WeatherAPI a través de Airflow.
4. Confirmar la lectura posterior de esos registros mediante FastAPI y probar dos usuarios reales.
5. Inspeccionar el tráfico de una sesión autenticada completa: el navegador no debe contactar WeatherAPI.

Las verificaciones automatizadas, la lectura del código y la vista de QA no sustituyen esas pruebas integradas. El arranque saludable de Airflow valida sus componentes locales, no las credenciales ni una ingesta remota. La advertencia de deprecación de Starlette sobre su cliente de pruebas no provocó fallos; las comprobaciones HTTP del backend también se realizaron sobre el servidor real.

## Corrección del 27 de octubre de 2026: verificación HTTPS de la sesión

Se investigó el mensaje «No se pudo verificar la sesión» con HTTP 503. La URL del proyecto coincidía entre frontend y backend. La descarga real de las claves públicas de Supabase mediante el cliente original falló con `SSLCertVerificationError: unable to get local issuer certificate`: la instalación local de Python no tenía raíces de confianza predeterminadas disponibles.

La misma consulta pública utilizando `certifi` respondió HTTP 200 y devolvió una clave ES256. Se corrigió el cliente JWKS para conservar la configuración de confianza predeterminada y cargar además las raíces del paquete `certifi` instalado en la `.venv`. Se declaró esa dependencia directamente y se añadió un aviso de diagnóstico que registra solo el tipo de error, sin tokens ni URLs.

Resultado de esta corrección: **25 pruebas del backend aprobadas**, incluidas dos nuevas regresiones para certificados y errores de conexión. El cliente corregido también descargó las claves del proyecto real con `CERT_REQUIRED` y comprobación de nombre de host activadas. No se utilizaron tokens de sesión ni claves privadas para esa consulta pública. Las otras suites no se volvieron a ejecutar porque sus servicios no cambiaron.

El proceso FastAPI que ya estaba en ejecución necesita reiniciarse para cargar la corrección. La consulta pública valida la conexión HTTPS del verificador; no constituye una prueba integrada del acceso autenticado a las tablas ni de la ingesta de WeatherAPI.

## Diagnóstico posterior del 401: 27 de octubre de 2026

Se comprobó que frontend y backend tienen la misma URL y clave publicable, y que Supabase Auth acepta esa clave y tiene Google habilitado. Una consulta de cero filas sin sesión a `user_recent_locations` fue rechazada por el rol anónimo, tal como requieren los permisos de la práctica. Ese resultado no prueba un fallo de permisos del usuario autenticado; no se modificaron las políticas ni los grants.

Se agregó un diagnóstico saneado para distinguir rechazos de JWT locales y rechazos de Supabase Data API. El frontend ahora conserva el motivo del rechazo en la bienvenida, en lugar de sustituir cualquier 401 por una supuesta expiración. Los errores de configuración de claves de API se informan con 503 y no fuerzan la salida del usuario.

Se aprobaron **30 pruebas del backend** y **19 del frontend**, además del build de producción. Las nuevas regresiones incluyen sesiones ES256, diagnóstico sin tokens, diferenciación entre fallos de clave y sesión, y conservación del mensaje después de salir. No se leyó ni compartió ningún token del navegador.

Después del reinicio, el usuario confirmó que pudo autenticarse con Google y acceder a la vista principal. No se recibió una nueva línea de rechazo que permita atribuir la causa concreta del 401 anterior. Esta confirmación no implica haber verificado la ingesta meteorológica ni todas las consultas autenticadas de extremo a extremo.

## Búsquedas fallidas: clave de WeatherAPI, 27 de octubre de 2026

Una búsqueda real de prueba con el cliente del pipeline devolvió **HTTP 401 y código WeatherAPI 2006**, correspondiente a una API key inválida. La clave cargada coincidía con `pipeline/.env`, no tenía espacios exteriores y no se imprimió en el diagnóstico. Este rechazo ocurre antes de publicar los candidatos y explica los trabajos `search` con estado `failed`. `location_id=NULL` es normal durante la búsqueda.

Se sustituyó el mensaje genérico de credenciales/cuota por mensajes fijos que identifican los códigos 1002, 2006, 2007, 2008 y 2009. No se registra el texto bruto del proveedor, porque podría contener credenciales. Se aprobaron **24 pruebas del pipeline**, incluidas regresiones para diferenciar las causas, guardar errores sin reintentarlos y no divulgar claves.

La solución operativa requiere reemplazar la credencial por la API key válida de la cuenta WeatherAPI, reiniciar Airflow y enviar otra búsqueda. No se modificaron claves, registros históricos, permisos ni tablas de Supabase. La búsqueda con una clave válida y la publicación posterior siguen pendientes de esa actualización local.

Tras la sustitución indicada por el usuario, se repitió una petición directa usando el archivo `.env` actualizado. La clave cargada coincidía con el archivo, no había una variable de entorno heredada en el proceso de diagnóstico ni espacios o formato adicional, y WeatherAPI volvió a devolver 401/2006. Los trabajos recientes también registraron 2006. Esto reproduce el rechazo fuera de Airflow; no se atribuye únicamente a registros históricos o a un proceso antiguo. Queda por confirmar el dominio que emitió la credencial, sin compartir su valor ni probarla contra servicios distintos.

El usuario confirmó posteriormente que obtuvo la clave en `home.openweathermap.org/api_keys`. Se identificó así la discrepancia: la credencial procede de OpenWeather, mientras el pipeline utiliza WeatherAPI.com, según el proveedor acordado. Se documentó la diferencia. No se cambió el proveedor ni se envió la credencial a otros servicios. Sigue pendiente obtener una clave de WeatherAPI.com y repetir la búsqueda con ella.
