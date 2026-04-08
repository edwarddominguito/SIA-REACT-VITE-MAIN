# Refactor Baseline Map

## Frontend Route Matrix

| Route | Access | Screen |
| --- | --- | --- |
| `/` | Public | Home |
| `/properties/:id` | Public | Property Details |
| `/login` | Public | Login |
| `/register` | Public | Register |
| `/forgot-password` | Public | Forgot Password |
| `/dashboard` | Authenticated | Role Redirect |
| `/notifications` | Authenticated | Notifications |
| `/admin` | Admin | Admin Dashboard |
| `/admin/add-user` | Admin | Admin Add User |
| `/agent` | Agent | Agent Dashboard |
| `/customer/*` | Customer | Customer Dashboard |

## Backend API Endpoint Matrix

### Health and State
- `GET /api/health`
- `GET /api/state`
- `PUT /api/state`

### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/reset-password`

### Users
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

### Properties
- `GET /api/properties`
- `POST /api/properties`
- `PATCH /api/properties/:id`
- `DELETE /api/properties/:id`

### Appointments
- `GET /api/appointments`
- `POST /api/appointments`
- `PATCH /api/appointments/:id`
- `PATCH /api/appointments/:id/status`

### Trips
- `GET /api/trips`
- `POST /api/trips`
- `PATCH /api/trips/:id`
- `DELETE /api/trips/:id`

### Office Meetings
- `GET /api/office-meets`
- `POST /api/office-meets`
- `PATCH /api/office-meets/:id/status`

### Reviews
- `GET /api/reviews`
- `POST /api/reviews`
- `PATCH /api/reviews/:id`
- `DELETE /api/reviews/:id`

### Messages
- `GET /api/messages/stream`
- `GET /api/messages/contacts`
- `GET /api/messages`
- `POST /api/messages`
- `POST /api/messages/webhooks/httpsms`

### Notifications
- `GET /api/notifications`
- `POST /api/notifications`
- `PATCH /api/notifications/:id/read`

### Calendar
- `GET /api/calendar/google/status`
- `POST /api/calendar/google/sync`
- `GET /api/calendar/events`

### Dashboard
- `GET /api/dashboard/stats`

## Critical Flow Parity Checklist

1. Login and role redirect (`admin`, `agent`, `customer`).
2. Dashboard read and edit flows for all roles.
3. Messaging read stream/send and notification deep link.
4. Notifications read/unread status updates.
5. Calendar status and sync endpoint behavior.

