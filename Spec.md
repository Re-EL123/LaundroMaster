# LaundroMaster Platform — Technical Specifications & Architecture

## Platform Overview

**LaundroMaster** is a multi-platform laundromat marketplace ecosystem built using:

* [Expo Snack](https://snack.expo.dev?utm_source=chatgpt.com)
* [Expo React Native](https://expo.dev?utm_source=chatgpt.com)
* [Supabase](https://supabase.com?utm_source=chatgpt.com)
* [Vercel](https://vercel.com?utm_source=chatgpt.com)
* [iKhokha](https://www.ikhokha.com?utm_source=chatgpt.com)

The ecosystem consists of:

1. **LaundroMaster App** — Customer mobile app
2. **LaundroMaster Owner App** — Laundromat owner mobile app
3. **LaundroMaster Admin Panel** — Web admin dashboard (`index.html`)

---

# 1. SYSTEM OBJECTIVES

## Customer App Features

Customers can:

* Discover nearby laundromats
* View laundromat profiles
* Book laundry services
* Track order progress
* Make payments
* Chat with laundromats
* Rate and review laundromats
* Save favorite laundromats
* Receive notifications

---

## Owner App Features

Laundromat owners can:

* Register laundromat
* Upload verification documents
* Manage orders
* Accept/reject bookings
* Manage pricing
* Manage service categories
* View analytics
* Track earnings
* Manage staff
* Receive payouts

---

## Admin Panel Features

Admins can:

* Vet laundromats
* Verify identities/documents
* Suspend accounts
* Manage disputes
* Manage platform commissions
* Monitor transactions
* Manage users
* View system analytics
* Manage featured laundromats

---

# 2. HIGH LEVEL SYSTEM ARCHITECTURE

```txt
                    ┌─────────────────────┐
                    │  Customer App       │
                    │  Expo React Native  │
                    └─────────┬───────────┘
                              │
                              │ HTTPS
                              ▼
                    ┌─────────────────────┐
                    │  Vercel API Layer   │
                    │  Serverless APIs    │
                    └─────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
 ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
 │ iKhokha API    │  │ Supabase DB    │  │ Supabase Auth  │
 │ Payments       │  │ PostgreSQL     │  │ Authentication │
 └────────────────┘  └────────────────┘  └────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Supabase Storage    │
                    │ Images/Documents    │
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │ Owner App           │
                    │ Expo React Native   │
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │ Admin Panel         │
                    │ HTML + JS           │
                    └─────────────────────┘
```

---

# 3. TECH STACK

| Layer              | Technology                   |
| ------------------ | ---------------------------- |
| Mobile Framework   | Expo React Native            |
| UI Framework       | React Native Paper           |
| Navigation         | Expo Router                  |
| Maps               | react-native-maps            |
| Geolocation        | expo-location                |
| Backend APIs       | Vercel Serverless            |
| Database           | Supabase PostgreSQL          |
| Authentication     | Supabase Auth                |
| File Storage       | Supabase Storage             |
| Payments           | iKhokha API                  |
| Push Notifications | Expo Notifications           |
| State Management   | Zustand                      |
| Forms              | React Hook Form              |
| Validation         | Zod                          |
| Image Uploads      | Expo Image Picker            |
| Real-time          | Supabase Realtime            |
| Admin Panel        | HTML + Tailwind + Vanilla JS |
| Deployment         | Vercel                       |

---

# 4. SECURITY ARCHITECTURE

## Why Vercel APIs Exist

Sensitive operations MUST NOT happen inside Expo apps directly.

The mobile apps should NEVER expose:

* iKhokha secret keys
* Supabase service role keys
* Admin credentials
* Payment verification secrets

---

## Secure Architecture Flow

```txt
Mobile App
   │
   ▼
Vercel Serverless API
   │
   ├── Secure payment handling
   ├── Signature generation
   ├── Payment verification
   ├── Admin validation
   ├── Booking verification
   └── Rate limiting
```

---

# 5. MAXIMUM 12 SERVERLESS APIs

## Vercel API Structure

```txt
/api
├── auth
├── payments
├── bookings
├── laundromats
├── reviews
├── notifications
├── uploads
├── admin
├── analytics
├── payouts
├── webhooks
└── geo
```

---

## API Responsibilities

| API           | Purpose                        |
| ------------- | ------------------------------ |
| auth          | JWT validation                 |
| payments      | iKhokha payment initialization |
| bookings      | Booking security validation    |
| laundromats   | Sanitized laundromat data      |
| reviews       | Review moderation              |
| notifications | Push notification triggers     |
| uploads       | Secure upload signatures       |
| admin         | Admin protected actions        |
| analytics     | Revenue/statistics             |
| payouts       | Owner payout logic             |
| webhooks      | iKhokha webhook handling       |
| geo           | Distance/location calculations |

---

# 6. DATABASE ARCHITECTURE (SUPABASE)

## Main Tables

```txt
users
laundromats
services
bookings
booking_items
payments
reviews
favorites
notifications
documents
staff
transactions
withdrawals
admin_logs
```

---

# 7. DATABASE RELATIONSHIPS

```txt
users
 ├── laundromats
 ├── bookings
 ├── reviews
 └── favorites

laundromats
 ├── services
 ├── bookings
 ├── reviews
 └── staff

bookings
 ├── booking_items
 ├── payments
 └── notifications
```

---

# 8. AUTHENTICATION FLOW

## Roles

| Role     | Access       |
| -------- | ------------ |
| customer | Customer app |
| owner    | Owner app    |
| admin    | Admin panel  |

---

## Login Methods

* Email/password
* Phone OTP
* Social login (optional later)

---

# 9. CUSTOMER APP SCREENS

# LaundroMaster (Customer)

## Screen Map

```txt
Auth
├── Splash
├── Login
├── Register
├── OTP Verification
└── Forgot Password

Main
├── Home
├── Map Discovery
├── Search
├── Booking
├── Checkout
├── Orders
├── Chat
├── Notifications
├── Favorites
├── Reviews
├── Wallet
├── Profile
└── Settings
```

---

# 10. OWNER APP SCREENS

# LaundroMaster Owner

```txt
Auth
├── Login
├── Register
├── Verification
└── KYC Upload

Dashboard
├── Overview
├── Orders
├── Customers
├── Services
├── Pricing
├── Earnings
├── Analytics
├── Staff
├── Reviews
├── Notifications
├── Payouts
└── Settings
```

---

# 11. ADMIN PANEL STRUCTURE

# LaundroMaster Admin

```txt
index.html
├── Login
├── Dashboard
├── User Management
├── Laundromat Vetting
├── Verification Center
├── Booking Monitoring
├── Revenue Monitoring
├── Disputes
├── Reports
├── Analytics
└── System Settings
```

---

# 12. BOOKING MAP SCREEN SPECIFICATION

## Booking Screen Components

The booking screen includes:

### Left Section

* Google/Apple map
* Nearby laundromats
* Live pins
* User location
* Radius filters

### Right/Bottom Card

Each laundromat card displays:

* Avatar/logo
* Business name
* Rating
* Total reviews
* Distance
* Open/closed status
* Service types
* Estimated turnaround
* Price indicators
* Pickup availability
* Delivery availability

---

## Booking Flow

```txt
Select Laundromat
      ↓
View Services
      ↓
Add Laundry Items
      ↓
Select Pickup/Dropoff
      ↓
Choose Date & Time
      ↓
Payment
      ↓
Booking Confirmation
```

---

# 13. MAP IMPLEMENTATION

## Recommended Map Stack

| Feature     | Package                     |
| ----------- | --------------------------- |
| Maps        | react-native-maps           |
| Markers     | Custom SVG markers          |
| Geolocation | expo-location               |
| Clustering  | react-native-map-clustering |

---

# 14. SUPABASE STORAGE STRUCTURE

```txt
storage
├── avatars
├── laundromats
├── documents
├── bookings
├── receipts
├── reviews
└── banners
```

---

# 15. REALTIME FEATURES

## Supabase Realtime Usage

| Feature         | Realtime |
| --------------- | -------- |
| Booking updates | Yes      |
| Order status    | Yes      |
| Chats           | Yes      |
| Notifications   | Yes      |
| Owner dashboard | Yes      |

---

# 16. PAYMENT FLOW (IKHOKHA)

## Secure Payment Flow

```txt
Customer App
   ↓
Vercel API
   ↓
iKhokha Payment Session
   ↓
Customer Pays
   ↓
Webhook Verification
   ↓
Supabase Update
   ↓
Booking Confirmed
```

---

# 17. FILE STRUCTURE — CUSTOMER APP

# LaundroMaster App File Map

```txt
LaundroMaster/
├── app/
│   ├── (auth)/
│   ├── (tabs)/
│   ├── booking/
│   ├── laundromat/
│   ├── checkout/
│   ├── orders/
│   ├── chat/
│   ├── profile/
│   └── settings/
│
├── assets/
│   ├── icons/
│   ├── fonts/
│   ├── images/
│   └── animations/
│
├── components/
│   ├── cards/
│   ├── buttons/
│   ├── maps/
│   ├── modals/
│   ├── forms/
│   ├── ratings/
│   └── loaders/
│
├── hooks/
├── services/
├── stores/
├── utils/
├── constants/
├── theme/
├── types/
├── lib/
└── config/
```

---

# 18. FILE STRUCTURE — OWNER APP

```txt
LaundroMasterOwner/
├── app/
├── components/
├── analytics/
├── services/
├── hooks/
├── stores/
├── lib/
├── theme/
├── assets/
└── config/
```

---

# 19. FILE STRUCTURE — ADMIN PANEL

```txt
admin/
├── index.html
├── css/
├── js/
├── assets/
├── pages/
├── components/
├── charts/
└── services/
```

---

# 20. UI DESIGN SYSTEM

## Brand Colors

| Color | HEX     |
| ----- | ------- |
| Red   | #D90429 |
| Black | #111111 |
| Grey  | #6C757D |
| White | #FFFFFF |

---

## UI Style

* Modern marketplace design
* Uber-style map interactions
* Rounded cards
* Soft shadows
* Floating action buttons
* Minimalist layout
* Smooth transitions

---

# 21. RECOMMENDED COMPONENTS

## Customer App

```txt
LaundromatCard
BookingCard
ServiceSelector
MapMarker
RatingStars
PriceBreakdown
BookingTimeline
OrderTracker
```

---

## Owner App

```txt
RevenueCard
BookingManager
AnalyticsChart
PayoutCard
VerificationStatus
ServiceEditor
```

---

# 22. SCALABILITY PLAN

## Initial Scale

* 1,000 laundromats
* 100,000 users
* 10,000 concurrent bookings

---

## Future Expansion

* Driver app
* AI recommendations
* Dynamic pricing
* Subscription plans
* Franchise support
* Multi-country support

---

# 23. DEPLOYMENT ARCHITECTURE

```txt
Expo Apps
   ↓
Vercel APIs
   ↓
Supabase
   ↓
iKhokha
```

---

# 24. PERFORMANCE OPTIMIZATION

## Mobile Optimization

* Lazy loading
* Image compression
* Skeleton loaders
* Infinite scrolling
* Map clustering
* Offline caching

---

# 25. RECOMMENDED EXPO PACKAGES

## Core Packages

```txt
expo-router
expo-location
expo-notifications
expo-image-picker
react-native-maps
zustand
react-hook-form
zod
react-native-paper
react-native-svg
```

---

# 26. CRITICAL SECURITY RULES

## NEVER Expose

* Supabase service_role key
* iKhokha secret key
* Admin credentials
* Internal API secrets

---

## ALWAYS Use

* Row Level Security (RLS)
* JWT validation
* API middleware
* Input sanitization
* Signed uploads
* Webhook verification

---

# 27. MONOREPO STRUCTURE

```txt
LaundroMaster-Ecosystem/
├── apps/
│   ├── customer-app/
│   ├── owner-app/
│   └── admin-panel/
│
├── shared/
│   ├── ui/
│   ├── constants/
│   ├── theme/
│   ├── types/
│   └── utils/
│
├── api/
│   ├── auth/
│   ├── payments/
│   ├── bookings/
│   └── webhooks/
│
├── docs/
├── scripts/
└── package.json
```

---

# 28. RECOMMENDED FUTURE MODULES

## Future Additions

* Pickup driver tracking
* AI stain analysis
* Smart pricing engine
* WhatsApp integration
* Loyalty rewards
* Promo codes
* QR code pickups
* Subscription laundry plans
