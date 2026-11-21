"""Neon / PostgreSQL product and sales queries."""
from __future__ import annotations

import time

import psycopg2
from psycopg2.extras import RealDictCursor

import config

_db_cache = {"data": None, "expires_at": 0.0}
_top_sellers_cache = {"data": None, "expires_at": 0.0}


def get_db_connection():
    if config.DATABASE_URL:
        return psycopg2.connect(config.DATABASE_URL, connect_timeout=5)
    return psycopg2.connect(
        host=config.DB_HOST,
        database=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASS,
        port=config.DB_PORT,
        connect_timeout=5,
    )


def compact_product(row):
    image = row.get("image_url") or row.get("main_image") or row.get("image_path")
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "price": row.get("price"),
        "stock": row.get("stock"),
        "sizes": row.get("sizes"),
        "category": row.get("category"),
        "image_url": image,
        "slug": row.get("slug"),
    }


def compact_lot(row):
    return {
        "product": row.get("product_name"),
        "size": row.get("size"),
        "color": row.get("color"),
        "qty": row.get("quantity_on_hand"),
        "price": row.get("unit_price"),
        "image_url": row.get("image_url") or row.get("main_image"),
    }


def fetch_db_products():
    """Return compact The Man Store products + inventory lots from Neon."""
    try:
        with get_db_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        p.id,
                        p.name,
                        p.slug,
                        p.price,
                        p.stock,
                        p.sizes,
                        c.name AS category,
                        COALESCE(
                            NULLIF(BTRIM(p.image_url), ''),
                            NULLIF(BTRIM(p.main_image), ''),
                            (
                                SELECT NULLIF(BTRIM(pi.path), '')
                                FROM product_images pi
                                WHERE pi.product_id = p.id
                                ORDER BY pi.is_primary DESC NULLS LAST,
                                         pi.sort_order ASC NULLS LAST,
                                         pi.id ASC
                                LIMIT 1
                            )
                        ) AS image_url
                    FROM products p
                    LEFT JOIN categories c ON c.id = p.category_id
                    WHERE COALESCE(p.is_active, TRUE) = TRUE
                    ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
                    LIMIT {config.PRODUCT_LIMIT}
                    """
                )
                products = [compact_product(dict(row)) for row in cursor.fetchall()]

                cursor.execute(
                    f"""
                    SELECT
                        p.name AS product_name,
                        il.size,
                        il.color,
                        il.quantity_on_hand,
                        il.unit_price,
                        COALESCE(
                            NULLIF(BTRIM(p.image_url), ''),
                            NULLIF(BTRIM(p.main_image), '')
                        ) AS image_url
                    FROM inventory_lots il
                    JOIN products p ON p.id = il.product_id
                    WHERE COALESCE(il.is_sellable, TRUE) = TRUE
                      AND COALESCE(il.quantity_on_hand, 0) > 0
                    ORDER BY il.quantity_on_hand DESC, p.name
                    LIMIT {config.LOT_LIMIT}
                    """
                )
                lots = [compact_lot(dict(row)) for row in cursor.fetchall()]
                return {"products": products, "inventory_lots": lots}
    except psycopg2.Error as error:
        print(f"PostgreSQL unavailable: {error}")
        return None


def get_db_products(use_cache=True):
    now = time.time()
    if use_cache and _db_cache["data"] is not None and now < _db_cache["expires_at"]:
        return _db_cache["data"]

    data = fetch_db_products()
    if data is not None:
        _db_cache["data"] = data
        _db_cache["expires_at"] = now + config.DB_CACHE_TTL_SEC
    return data


def fetch_top_sellers(limit=5):
    """Best-selling products from real order_items sales data."""
    try:
        with get_db_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        COALESCE(oi.name, p.name) AS product_name,
                        SUM(oi.qty)::int AS total_qty,
                        ROUND(SUM(oi.line_total)::numeric, 2) AS total_sales,
                        ROUND(MAX(oi.price)::numeric, 2) AS sample_price
                    FROM order_items oi
                    LEFT JOIN products p ON p.id = oi.product_id
                    WHERE COALESCE(oi.qty, 0) > 0
                    GROUP BY COALESCE(oi.name, p.name)
                    ORDER BY total_qty DESC NULLS LAST, total_sales DESC NULLS LAST
                    LIMIT %s
                    """,
                    (limit,),
                )
                return [dict(row) for row in cursor.fetchall()]
    except psycopg2.Error as error:
        print(f"Top sellers query failed: {error}")
        return None


def get_top_sellers(use_cache=True):
    now = time.time()
    if (
        use_cache
        and _top_sellers_cache["data"] is not None
        and now < _top_sellers_cache["expires_at"]
    ):
        return _top_sellers_cache["data"]

    data = fetch_top_sellers()
    if data is not None:
        _top_sellers_cache["data"] = data
        _top_sellers_cache["expires_at"] = now + config.DB_CACHE_TTL_SEC
    return data
