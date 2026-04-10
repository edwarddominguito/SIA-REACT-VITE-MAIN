# Unified Design System - Implementation Guide

## Overview

The application now uses a **unified design system** for consistent, professional styling across all components. All cards, buttons, typography, and spacing follow a single coherent pattern.

---

## Card Components

### Basic Card (No Image)

Use `.card-unified` for simple content cards:

```jsx
<div className="card-unified">
  <div className="card-body">
    <h3>Card Title</h3>
    <p className="text-body">Card content goes here</p>
  </div>
</div>
```

### Card with Image Header

Use `.card-unified.has-image` for cards with images at the top:

```jsx
<div className="card-unified has-image">
  <div className="card-image">
    <img src="image.jpg" alt="description" />
    <div className="card-badge">Available</div>
  </div>
  <div className="card-body">
    <h3>Property Title</h3>
    <div className="card-meta">
      <span>📍 Location</span>
      <span>⭐ 4.8</span>
    </div>
    <div className="card-footer">
      <button className="btn-unified btn-primary">Book Now</button>
      <button className="btn-unified btn-secondary">Details</button>
    </div>
  </div>
</div>
```

### Status Badge

Add status information with `.card-badge`:

```jsx
<div className="card-badge">Available</div>
<div className="card-badge">Sold</div>
<div className="card-badge">Coming Soon</div>
```

---

## Buttons

### Primary Button (Call-to-Action)

```jsx
<button className="btn-unified btn-primary">Book Appointment</button>
<a href="/details" className="btn-unified btn-primary">View Details</a>
```

### Secondary Button (Alternative Action)

```jsx
<button className="btn-unified btn-secondary">Cancel</button>
<button className="btn-unified btn-secondary">Learn More</button>
```

---

## Typography

### Title (Card Headers)

```jsx
<h3 className="text-title">Card Title</h3>
```

### Subtitle (Section Headers)

```jsx
<h4 className="text-subtitle">Section Heading</h4>
```

### Body Text (Main Content)

```jsx
<p className="text-body">This is body text for main content.</p>
```

### Caption/Meta (Supporting Info)

```jsx
<span className="text-caption">Premium Property</span>
```

---

## Spacing

Use CSS variables for consistent spacing:

```css
/* All available spacing tokens */
--spacing-xs: 4px;      /* tiny gaps */
--spacing-sm: 8px;      /* small spacing */
--spacing-md: 12px;     /* medium spacing */
--spacing-lg: 16px;     /* standard spacing */
--spacing-xl: 20px;     /* large spacing */
--spacing-2xl: 24px;    /* extra large */
--spacing-3xl: 32px;    /* maximum standard */
```

Example usage:

```css
.my-component {
  padding: var(--spacing-xl);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}
```

---

## Border Radius

```css
--border-radius-sm: 8px;        /* small corners */
--border-radius-md: 12px;       /* medium corners */
--border-radius-lg: 16px;       /* standard corners */
--border-radius-xl: 20px;       /* large corners */
--border-radius-full: 999px;    /* pills/circles */
```

---

## Shadows

Applied automatically on cards, but available for custom use:

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);      /* subtle */
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);      /* standard */
--shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.1);      /* elevated */
--shadow-xl: 0 12px 24px rgba(0, 0, 0, 0.12);    /* pronounced */
```

---

## Transitions

```css
--transition-fast: 0.15s ease;      /* quick feedback */
--transition-normal: 0.25s ease;    /* standard */
--transition-smooth: 0.35s ease;    /* flowing motion */
```

---

## Complete Example: Property Card

```jsx
// PropertyCard.jsx
export function PropertyCard({ property }) {
  return (
    <div className="card-unified has-image">
      {/* Image Header */}
      <div className="card-image">
        <img src={property.image} alt={property.title} />
        <div className="card-badge">{property.status}</div>
      </div>

      {/* Content */}
      <div className="card-body">
        <h3>{property.title}</h3>

        <div className="card-meta">
          <span>📍 {property.location}</span>
          <span>⭐ {property.rating}</span>
        </div>

        <p className="text-body">{property.description}</p>

        {/* Price */}
        <div>
          <span className="price-currency">From</span>
          <div className="price-display">${property.price}</div>
        </div>

        {/* Actions */}
        <div className="card-footer">
          <button className="btn-unified btn-primary">Book Now</button>
          <button className="btn-unified btn-secondary">Details</button>
        </div>
      </div>
    </div>
  );
}
```

---

## Colors

### Text Colors

- **Primary Text**: `#111827` (dark gray-900)
- **Secondary Text**: `#374151` (gray-700)
- **Muted Text**: `#6b7280` (gray-500)
- **Light Text**: `#9ca3af` (gray-400)

### Background

- **Cards**: `#ffffff` (white)
- **Hover**: `#f9fafb` (gray-50)
- **Borders**: `rgba(255, 255, 255, 0.08)` (subtle light border)

---

## Dark Mode (Future)

The system is designed to support dark mode through CSS variable overrides:

```css
.dark-mode {
  --card-bg: #1f2937;
  --text-primary: #f3f4f6;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  /* etc */
}
```

---

## Responsive Behavior

Cards and buttons automatically adjust on smaller screens:

- **Mobile**: Single-column layout, optimized spacing
- **Tablet**: 2-column grid
- **Desktop**: Full layout with proper spacing

---

## Migration Checklist

When updating existing components to use the unified system:

- [ ] Replace custom card styles with `.card-unified`
- [ ] Update buttons to `.btn-unified btn-primary` or `.btn-secondary`
- [ ] Use typography classes: `.text-title`, `.text-body`, etc.
- [ ] Replace hardcoded spacing/colors with CSS variables
- [ ] Ensure hover states use `.card-unified:hover`
- [ ] Test responsive behavior on mobile/tablet/desktop

---

## Usage in CSS

Import and use in your stylesheets:

```css
@import "./styles/design-system.css";

.my-custom-component {
  padding: var(--spacing-xl);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md);
  transition: transform var(--transition-normal);
}
```

---

## Questions or Issues?

The design system prioritizes:

1. **Consistency** - All cards/buttons look and feel the same
2. **Accessibility** - Proper contrast, readable typography
3. **Performance** - Smooth transitions, efficient shadows
4. **Maintainability** - Single source of truth for styling

For changes or additions, update `design-system.css` and all components will inherit the changes.
