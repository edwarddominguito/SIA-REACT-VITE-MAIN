import React from "react";
import "./PropertyCardUnified.css";

/**
 * PropertyCardUnified - Example implementation using the unified design system
 * 
 * This component demonstrates how to build components using the new unified
 * design system for consistency across the entire application.
 * 
 * Features:
 * - Image header with hover effect
 * - Status badge
 * - Clean card body with hierarchical typography
 * - Unified buttons with consistent styling
 * - Responsive design
 */
export function PropertyCardUnified({
  id,
  image,
  title,
  location,
  rating,
  price,
  status = "Available",
  description,
  features = [],
  onBookClick,
  onDetailsClick,
}) {
  const formatPrice = (p) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(p);
  };

  return (
    <div className="card-unified has-image">
      {/* Image Section with Status Badge */}
      <div className="card-image">
        <img src={image} alt={title} loading="lazy" />
        <div className="card-badge">{status}</div>
      </div>

      {/* Content Section */}
      <div className="card-body">
        {/* Title */}
        <h3 className="text-title">{title}</h3>

        {/* Meta Information */}
        <div className="card-meta">
          <span>📍 {location}</span>
          {rating && <span>⭐ {rating}</span>}
        </div>

        {/* Description */}
        {description && <p className="text-body">{description}</p>}

        {/* Features (optional) */}
        {features.length > 0 && (
          <div className="card-features">
            {features.map((feature, idx) => (
              <span key={idx} className="feature-tag">
                {feature}
              </span>
            ))}
          </div>
        )}

        {/* Price Display */}
        {price && (
          <div className="card-price-section">
            <span className="price-currency">Starting from</span>
            <div className="price-display">{formatPrice(price)}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="card-footer">
          <button
            className="btn-unified btn-primary"
            onClick={() => onBookClick?.(id)}
          >
            Book Now
          </button>
          <button
            className="btn-unified btn-secondary"
            onClick={() => onDetailsClick?.(id)}
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Example usage:
 * 
 * <PropertyCardUnified
 *   id="prop-123"
 *   image="/images/property.jpg"
 *   title="Luxury Beach Villa"
 *   location="Miami, Florida"
 *   rating={4.8}
 *   price={450000}
 *   status="Available"
 *   description="Beautiful oceanfront property with stunning views"
 *   features={["3 Bedrooms", "2 Bathrooms", "Ocean View"]}
 *   onBookClick={(id) => console.log("Book:", id)}
 *   onDetailsClick={(id) => console.log("Details:", id)}
 * />
 */
