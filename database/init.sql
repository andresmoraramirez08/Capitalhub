-- =============================================================================
-- CAPITALHUB - ESQUEMA DE BASE DE DATOS DEFINITIVO (POSTGRESQL)
-- Proyecto: CapitalHub - Barbería Capital
-- Alumno: Kevin Andrés Mora Ramírez
-- Fase 2: Arquitectura y Modelado de Datos
-- =============================================================================

-- Habilitar extensión para identificadores UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. CONTROL DE ACCESO Y SEGURIDAD (RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    descripcion VARCHAR(255),
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (nombre, descripcion) VALUES
('ADMIN', 'Administrador general / Dueño de la barbería'),
('BARBERO', 'Personal operativo que brinda servicios'),
('CLIENTE', 'Cliente registrado con cuenta activa');

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rol_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Cifrado bcrypt con factor >= 10
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. PERSONAL OPERATIVO (BARBEROS) Y HORARIOS
-- -----------------------------------------------------------------------------
CREATE TABLE barberos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    -- 0.65 para colaboradores; 1.00 si el barbero es el dueño del negocio
    porcentaje_comision NUMERIC(5,2) DEFAULT 0.65 CHECK (porcentaje_comision >= 0.00 AND porcentaje_comision <= 1.00),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE horarios_barberos (
    id SERIAL PRIMARY KEY,
    barbero_id UUID NOT NULL REFERENCES barberos(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0: Domingo, 1: Lunes, ..., 6: Sábado
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    es_descanso BOOLEAN DEFAULT FALSE,
    CONSTRAINT uq_barbero_dia UNIQUE (barbero_id, dia_semana),
    CONSTRAINT chk_horas_validas CHECK (hora_fin > hora_inicio OR es_descanso = TRUE)
);

-- -----------------------------------------------------------------------------
-- 3. CATÁLOGO DE SERVICIOS (INDIVIDUALES Y COMBINADOS)
-- -----------------------------------------------------------------------------
CREATE TABLE servicios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    duracion_minutos INT NOT NULL,
    precio NUMERIC(10,2) NOT NULL
);
INSERT INTO servicios (nombre, descripcion, duracion_minutos, precio) VALUES
-- Servicios Individuales
('Corte de Cabello Regular', 'Corte clásico o moderno con terminado a navaja', 40, 180.00),
('Arreglo de Barba', 'Delineado, rebaje y toalla caliente', 20, 120.00),
('Facial Limpieza Profunda', 'Exfoliación, vapor de ozono y mascarilla purificante', 40, 250.00),
('Pigmentación de Barba', 'Tinte y definición de áreas claras en barba', 10, 90.00),

-- Servicios Combinados (Tiempo de silla optimizado con cobro íntegro)
('Corte de Cabello + Facial', 'Corte de cabello realizado en paralelo mientras actúa la mascarilla facial', 60, 430.00),
('Corte de Cabello + Arreglo de Barba', 'Servicio integral de cabello y perfilado de barba', 50, 300.00),
('Servicio Completo (Corte + Barba + Facial)', 'Experiencia completa de cuidado personal masculino', 75, 550.00);
-- -----------------------------------------------------------------------------
-- 4. AGENDAMIENTO DE CITAS Y COMISIONES
-- -----------------------------------------------------------------------------
CREATE TYPE tipo_origen_cita AS ENUM ('WEB', 'PRESENCIAL', 'TELEFONO');
CREATE TYPE estado_cita AS ENUM ('PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO');

CREATE TABLE citas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barbero_id UUID NOT NULL REFERENCES barberos(id) ON DELETE RESTRICT,
    servicio_id INT NOT NULL REFERENCES servicios(id) ON DELETE RESTRICT,
    
    -- Si es usuario registrado se enlaza su ID; si es invitado queda NULL
    usuario_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre_invitado VARCHAR(100) NULL,
    telefono_invitado VARCHAR(20) NULL,
    email_invitado VARCHAR(150) NULL,

    fecha_cita DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    origen tipo_origen_cita DEFAULT 'WEB',
    estado estado_cita DEFAULT 'CONFIRMADA',
    tolerancia_minutos INT DEFAULT 10,
    motivo_cancelacion VARCHAR(255) NULL,
    
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_horario_cita CHECK (hora_fin > hora_inicio)
);

CREATE INDEX idx_citas_barbero_fecha ON citas(barbero_id, fecha_cita);

CREATE TYPE estado_pago_comision AS ENUM ('PENDIENTE', 'PAGADO');

CREATE TABLE comisiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cita_id UUID UNIQUE NOT NULL REFERENCES citas(id) ON DELETE RESTRICT,
    barbero_id UUID NOT NULL REFERENCES barberos(id) ON DELETE RESTRICT,
    monto_servicio NUMERIC(10,2) NOT NULL,
    porcentaje_aplicado NUMERIC(5,2) NOT NULL, -- 0.65 o 1.00
    monto_comision NUMERIC(10,2) NOT NULL,     -- Monto exacto calculado
    estado estado_pago_comision DEFAULT 'PENDIENTE',
    fecha_calculo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_liquidacion TIMESTAMP WITH TIME ZONE NULL
);

-- -----------------------------------------------------------------------------
-- 5. TIENDA E-COMMERCE, LOGÍSTICA E INVENTARIO
-- -----------------------------------------------------------------------------
CREATE TABLE categorias_productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

INSERT INTO categorias_productos (nombre) VALUES 
('Ceras y Pomadas'), 
('Peines y Accesorios'), 
('Shampoos'), 
('Cuidado de Barba y Minoxidil'), 
('Tintes para Cabello y Barba');

CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    categoria_id INT REFERENCES categorias_productos(id) ON DELETE SET NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio NUMERIC(10,2) NOT NULL CHECK (precio >= 0.00),
    stock_actual INT NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INT NOT NULL DEFAULT 3 CHECK (stock_minimo >= 0),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE tipo_metodo_pago AS ENUM ('PASARELA_ONLINE', 'EFECTIVO_LOCAL');
CREATE TYPE tipo_entrega_orden AS ENUM ('RECOGER_LOCAL', 'ENVIO_LOCAL_ESTATAL');
CREATE TYPE estado_orden_venta AS ENUM ('PENDIENTE', 'PAGADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA');

CREATE TABLE ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre_comprador VARCHAR(100) NOT NULL,
    email_comprador VARCHAR(150) NOT NULL,
    telefono_comprador VARCHAR(20) NOT NULL,
    
    -- Opciones de entrega y logística (acotado a nivel estatal)
    tipo_entrega tipo_entrega_orden NOT NULL DEFAULT 'RECOGER_LOCAL',
    estado_republica VARCHAR(50) DEFAULT 'Durango',
    municipio_ciudad VARCHAR(100) NULL,
    codigo_postal VARCHAR(10) NULL,
    direccion_calle VARCHAR(200) NULL,
    colonia VARCHAR(150) NULL,
    referencias_domicilio VARCHAR(255) NULL,
    costo_envio NUMERIC(10,2) DEFAULT 0.00 CHECK (costo_envio >= 0.00),
    paqueteria VARCHAR(50) NULL, -- Ej: 'Mensajería Express Local', 'Estafeta Durango'
    numero_guia VARCHAR(100) NULL,
    
    -- Transacción comercial
    metodo_pago tipo_metodo_pago NOT NULL,
    estado estado_orden_venta DEFAULT 'PENDIENTE',
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0.00),
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0.00),
    pasarela_referencia_id VARCHAR(100) NULL, -- Referencia Stripe/Mercado Pago (Cumplimiento PCI-DSS)
    notificacion_enviada BOOLEAN DEFAULT FALSE,
    
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0.00)
);

CREATE INDEX idx_detalle_ventas_venta ON detalle_ventas(venta_id);
