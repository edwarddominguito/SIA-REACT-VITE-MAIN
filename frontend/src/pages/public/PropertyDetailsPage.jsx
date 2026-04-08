import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getCurrentUser, safeArray, subscribeKeys } from "@/services/storageService.js";
import {
  withImage,
  applyPropertyImageFallback,
  listingTypeLabel,
  propertyPriceLabel,
  propertyStatusLabel
} from "@/utils/domain.js";
import "./public.css";

export default function PublicPropertyDetails() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getCurrentUser());
  const [properties, setProperties] = useState(() => safeArray("allProperties"));
  const property = useMemo(
    () => properties.find((x) => String(x?.id) === String(params.id)),
    [properties, params.id]
  );

  useEffect(() => {
    const refresh = () => {
      setUser(getCurrentUser());
      setProperties(safeArray("allProperties"));
    };
    refresh();
    return subscribeKeys(["allProperties", "currentUser"], refresh);
  }, []);

  const goBack = () => {
    const from = location.state?.from;
    if (typeof from === "string" && from.trim()) {
      navigate(from);
      return;
    }
    if (from && typeof from === "object" && typeof from.pathname === "string" && from.pathname.trim()) {
      navigate(from.pathname, { state: from.state || null });
      return;
    }
    navigate(user ? "/dashboard" : "/");
  };
  const handleImageError = (event) => {
    applyPropertyImageFallback(event.currentTarget, property || {});
  };

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-wrap">
          <div className="public-brand">
            <i className="bi bi-buildings"></i>
            <span className="public-brand-copy">
              <strong>TES PROPERTY</strong>
              <span>REAL ESTATE</span>
            </span>
          </div>
          <div className="public-actions">
            {user ? (
              <button type="button" className="btn btn-dark btn-sm" onClick={goBack}>Back</button>
            ) : (
              <>
                <button type="button" className="btn btn-outline-dark btn-sm" onClick={goBack}>Back</button>
                <Link className="btn btn-dark btn-sm" to="/login">Login</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="public-wrap">
        {!property ? (
          <section className="agent-empty large">
            <i className="bi bi-exclamation-circle"></i>
            <p>Property not found.</p>
          </section>
        ) : (
          <section className="public-details-grid">
            <img className="public-details-image" src={withImage(property)} alt={property.title || "Property"} onError={handleImageError} />
            <article className="public-details-body">
              <h1>{property.title || "Property"}</h1>
              <p className="muted mb-2"><i className="bi bi-geo-alt"></i> {property.location || "-"}</p>
              <div className="public-home-property-tags mb-3">
                <span>{listingTypeLabel(property)}</span>
                {property.propertyType ? <span>{String(property.propertyType).replace(/_/g, " ")}</span> : null}
                <span>{propertyStatusLabel(property)}</span>
              </div>
              <div className="public-price mb-3">{propertyPriceLabel(property)}</div>
              <div className="small mb-1">Bedrooms: {property.bedrooms || "-"}</div>
              <div className="small mb-1">Bathrooms: {property.bathrooms || "-"}</div>
              <div className="small mb-3">Area (sqft): {property.areaSqft || "-"}</div>
              <p>{property.description || "No description available."}</p>
              {!user && (
                <div className="public-cta-row">
                  <Link className="btn btn-dark btn-sm" to="/register">Register to Book</Link>
                </div>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
