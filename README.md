# Prácticas React · Guía rápida de ejecución

Este directorio contiene dos aplicaciones independientes:

- **WEATHER (Bruma):** consulta del clima por ciudad.
- **COUNTIRES (Orbe):** catálogo de países con búsqueda, filtros y detalles.

Ambas usan React + Vite, FastAPI, Apache Airflow y Supabase con acceso mediante Google. Los datos públicos se cargan mediante el pipeline; la interfaz consulta los datos guardados a través del backend.

Todos los comandos siguientes se ejecutan desde esta carpeta raíz: **PRACTICAS_REACT**.

## 1. Preparación inicial — sólo la primera vez

Necesitas Python **3.13**, Node.js **22.12 o una versión posterior compatible con Vite 7**, npm y conexión a internet. Para WEATHER, el comando `python3` debe corresponder a Python 3.13; para COUNTIRES debe estar disponible `python3.13`. La ejecución local está preparada para macOS/Linux; en Windows utiliza WSL.

Instala las dependencias de los proyectos que vayas a utilizar:

```sh
sh WEATHER/scripts/setup.sh
sh COUNTIRES/scripts/setup.sh
```

Los scripts crean los entornos virtuales e instalan las dependencias. También preparan los archivos `.env` sin sobrescribir los que ya existen. No necesitas activar manualmente las `.venv` para usar los comandos de arranque.

Antes de iniciar, completa la configuración de cada proyecto:

| Servicio | Configuración necesaria |
|---|---|
| Frontend | URL y clave pública de Supabase; URL del backend |
| Backend | URL y clave pública del mismo proyecto Supabase |
| Pipeline | URL de Supabase, clave privada de servidor y clave de la API del proveedor |

Cada aplicación usa su propio proyecto Supabase. Configura Google OAuth y aplica sus migraciones SQL siguiendo las guías completas: [WEATHER](WEATHER/README.md) y [COUNTIRES](COUNTIRES/README.md).

WEATHER utiliza una clave de **WeatherAPI**; COUNTIRES utiliza una clave propia de **REST Countries**. Son proveedores distintos.

En instalaciones existentes de COUNTIRES, aplica también la migración `002_safe_catalog_publication.sql` si todavía no lo has hecho. No vuelvas a ejecutar las migraciones iniciales sobre tablas ya creadas.

## 2. Ejecutar WEATHER

Abre **tres terminales**, todas situadas en la raíz, y deja cada proceso ejecutándose:

**Terminal 1 · Backend**

```sh
sh WEATHER/backend/run.sh
```

**Terminal 2 · Pipeline / Airflow**

```sh
sh WEATHER/pipeline/run.sh
```

**Terminal 3 · Frontend**

```sh
npm --prefix WEATHER/frontend run dev
```

Abre [WEATHER](http://127.0.0.1:5173), inicia sesión con Google, busca una ciudad y selecciónala. Las búsquedas nuevas y la primera carga necesitan que Airflow esté funcionando.

## 3. Ejecutar COUNTIRES

Abre **otras tres terminales** desde la raíz si también estás ejecutando WEATHER:

**Terminal 1 · Backend**

```sh
sh COUNTIRES/backend/run.sh
```

**Terminal 2 · Pipeline / Airflow**

```sh
sh COUNTIRES/pipeline/run.sh
```

**Terminal 3 · Frontend**

```sh
npm --prefix COUNTIRES/frontend run dev
```

Abre [COUNTIRES](http://127.0.0.1:5175) e inicia sesión con Google. Si el catálogo está vacío, pulsa **Cargar catálogo** y espera a que termine el procesamiento. Después podrás buscar, filtrar y abrir los detalles de cada país.

## Direcciones locales

| Servicio | WEATHER | COUNTIRES |
|---|---|---|
| Aplicación | [127.0.0.1:5173](http://127.0.0.1:5173) | [127.0.0.1:5175](http://127.0.0.1:5175) |
| Documentación del backend | [8000/docs](http://127.0.0.1:8000/docs) | [8001/docs](http://127.0.0.1:8001/docs) |
| Estado del backend | [8000/health](http://127.0.0.1:8000/health) | [8001/health](http://127.0.0.1:8001/health) |
| Panel de Airflow | [127.0.0.1:8080](http://127.0.0.1:8080) | [127.0.0.1:8081](http://127.0.0.1:8081) |

Puedes ejecutar ambas aplicaciones al mismo tiempo. Usa el mismo origen para iniciar y completar Google OAuth; las guías detalladas explican cómo autorizar los callbacks locales.

## Detener, reiniciar y resolver problemas

- **Detener:** pulsa `Ctrl+C` en cada terminal.
- **Cambiaste un `.env`:** reinicia el servicio correspondiente. Para el pipeline, detén y vuelve a iniciar Airflow completo.
- **La información no aparece:** comprueba que backend y Airflow estén activos. Revisa el campo `error` de `ingestion_jobs` en Supabase y el log de la tarea en el panel de Airflow. La primera carga puede tardar varios minutos.
- **Puerto ocupado:** comprueba si ya tienes ese mismo servicio abierto en otra terminal.
- **Acceso al panel Airflow:** utiliza las credenciales locales generadas por `standalone`, indicadas en su terminal; son diferentes de tu acceso con Google.

Para ejecutar las pruebas, desde la raíz:

```sh
sh WEATHER/scripts/test.sh
sh COUNTIRES/scripts/test.sh
```

Los archivos `.env`, claves privadas, logs, bases locales de Airflow y dependencias están excluidos por `.gitignore`. Sube las plantillas `.env.example` con valores de ejemplo; conserva las credenciales reales sólo en tu equipo.
