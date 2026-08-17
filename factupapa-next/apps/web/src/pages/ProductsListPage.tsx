import { ChevronRight, Package, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { financeApi, productsApi } from "../api/services";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import { formatMoney, formatQuantity, unitLabel } from "../utils/format";

export function ProductsListPage() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(true);
  const [page, setPage] = useState(1);
  const products = useQuery({
    queryKey: ["products", search, active, page],
    queryFn: () =>
      productsApi.list({
        search: search || undefined,
        isActive: active,
        page,
        pageSize: 20,
      }),
  });
  const stock = useQuery({
    queryKey: ["stock"],
    queryFn: financeApi.stock,
  });
  const stockByProduct = new Map(
    stock.data?.map((item) => [item.productId, item.quantity]) ?? [],
  );
  return (
    <section className="catalog-section" aria-labelledby="products-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Venta</p>
          <h2 id="products-title">Productos</h2>
        </div>
        <Link className="compact-action" to="/productos/nuevo">
          <Plus />
          Añadir
        </Link>
      </div>
      <label className="search-box">
        <Search aria-hidden="true" />
        <span className="sr-only">Buscar productos</span>
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Nombre o SKU"
        />
      </label>
      <div className="filter-row" aria-label="Filtrar productos">
        <button
          className={active ? "active" : ""}
          onClick={() => {
            setActive(true);
            setPage(1);
          }}
        >
          Activos
        </button>
        <button
          className={!active ? "active" : ""}
          onClick={() => {
            setActive(false);
            setPage(1);
          }}
        >
          Inactivos
        </button>
      </div>
      {products.isLoading && (
        <div className="card-list">
          {[1, 2, 3].map((item) => (
            <div className="skeleton-card" key={item} />
          ))}
        </div>
      )}
      {products.isError && (
        <div className="inline-error" role="alert">
          No se han podido cargar los productos.{" "}
          <button onClick={() => void products.refetch()}>Reintentar</button>
        </div>
      )}
      {products.data?.items.length === 0 && (
        <EmptyState
          title="No hay productos aquí"
          description={
            search
              ? "Prueba otra búsqueda."
              : "Añade tu primer producto o importa un catálogo."
          }
          action={
            <Link className="button button--primary" to="/productos/nuevo">
              <span>Crear producto</span>
            </Link>
          }
        />
      )}
      <div className="card-list">
        {products.data?.items.map((product) => (
          <Link
            className="entity-card product-card"
            to={`/productos/${product.id}/editar`}
            key={product.id}
          >
            <span className="entity-card__icon">
              <Package />
            </span>
            <span className="entity-card__body">
              <strong>{product.name}</strong>
              <small>
                {product.sku || `Unidad: ${unitLabel(product.unit)}`}
              </small>
              <span className="product-price">
                {formatMoney(product.salePrice)}{" "}
                <small>/ {unitLabel(product.unit)}</small>
              </span>
              {stockByProduct.has(product.id) ? (
                <span className="product-stock-badge">
                  Stock: {formatQuantity(stockByProduct.get(product.id) ?? "0")} {unitLabel(product.unit)}
                </span>
              ) : null}
            </span>
            <ChevronRight />
          </Link>
        ))}
      </div>
      {products.data && products.data.total > products.data.pageSize && (
        <div className="pagination">
          <Button
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span>Página {page}</span>
          <Button
            variant="secondary"
            disabled={page * products.data.pageSize >= products.data.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </section>
  );
}
