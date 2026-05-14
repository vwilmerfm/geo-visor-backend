# Backend Geovisor - CA 2026

API RESTful desarrollada en Node.js para el Sistema de Visualización Cartográfica del CA 2026 (INE). 

## Tecnologías 

* **Entorno:** Node.js + Express.js
* **Base de Datos:** PostgreSQL con la extensión espacial **PostGIS**.
* **Autenticación:** JWT (JSON Web Tokens) + Integración con Active Directory (LDAP).
* **Reportes:** `exceljs` para la exportación de matrices de datos.
* **Seguridad:** Encriptación de contraseñas con `bcrypt` y protección de rutas mediante middlewares.

## Características

1.  **Módulo de Seguridad y Accesos:**
    * Autenticación: Inicio de sesión delegando credenciales al servidor Active Directory institucional o mediante cuentas locales.
    * Sincronización automática de usuarios del AD a la base de datos PostgreSQL en el primer login exitoso.
    * Control de acceso basado en roles (Administrador, Supervisor, Usuario) y protección de endpoints mediante JWT.
2.  **Módulo de Procesamiento Espacial:**
    * Servicio de geometrías en formato `GeoJSON` listas para ser consumidas por Leaflet en el frontend.
    * Consultas espaciales anidadas (Departamentos > Municipios > Comunidades > Áreas Censales > Predios/Manzanos) cruzando datos con `insumos.municipios_ds_5050`.
3.  **Módulo de Reportes:**
    * Generación de libros de Excel multipestaña (Disperso, Amanzanado, Comunidades/APA).

## Requisitos 

* Node.js (v18 o superior recomendado).
* PostgreSQL (v12 o superior) con PostGIS habilitado.
* Conexión a la red institucional para la resolución del LDAP (Active Directory).

## Instalación y Configuración

1.  **Clonar e instalar dependencias:**
    ```bash
    git clone https://github.com/vwilmerfm/geo-visor-backend.git
    cd backend-geovisor
    npm install
    ```

2.  **Variables de Entorno:**
    Crear un archivo `.env` en la raíz del proyecto se necesita definir:
    ```env
    # Servidor
    PORT=2026

    # Base de Datos PostgreSQL
    DB_USER=tu_usuario
    DB_PASSWORD=password
    DB_HOST=10.16.X.X
    DB_PORT=5432
    DB_NAME=base_datos

    # Seguridad JWT
    JWT_SECRET=clave_secreta_super_segura

    # Active Directory (INE)
    AD_URL=ldap://servidor_ad
    AD_BASE_DN=dc=ine,dc=gob,dc=bo
    AD_USER=usuario_lectura_ad@ine.gob.bo
    AD_PASSWORD=password_lectura_ad
    ```

3.  **Ejecución:**
    Para entorno de desarrollo:
    ```bash
    npm run dev
    ```

## Estructura del Proyecto

* `/config`: Configuración de la conexión al pool de base de datos (`db.js`).
* `/controllers`: Lógica de negocio (`authController.js`, `mapController.js`).
* `/middleware`: Validadores de JWT e interceptores de roles (`authMiddleware.js`).
* `/routes`: Definición de los endpoints expuestos (`authRoute.js`, `mapRoute.js`).

## Endpoints 

### Autenticación (`/api/auth`)
* `POST /login`: Valida credenciales contra AD o Local y retorna JWT.
* `GET /buscar-ad/:search`: Búsqueda de usuarios en el Active Directory (Requiere Rol Admin).
* `POST /crear-admin`: Registro de cuentas de administración locales.

### Cartografía y Datos (`/api/map`)
* `GET /departamentos`: Retorna el GeoJSON nacional.
* `GET /municipios/:departamento_id`: Filtra geometrías por departamento.
* `GET /descargar-excel-sectores-municipal/:id`: Genera el archivo `.xlsx` de cobertura.