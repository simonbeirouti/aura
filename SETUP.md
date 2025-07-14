# Aura Authentication Setup Guide

This guide will help you set up Firebase authentication in your Tauri + SvelteKit application.

## Prerequisites

1. A Firebase project with Authentication enabled
2. Node.js and npm/pnpm installed
3. Rust and Cargo installed

## Step 1: Firebase Project Setup

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable Authentication:
   - Navigate to **Build > Authentication**
   - Go to **Sign-in method** tab
   - Enable **Google** and **Email/Password** providers
4. Get your Firebase configuration:
   - Go to **Project Settings** (gear icon)
   - Scroll down to **Your apps** section
   - Click the web icon (`</>`) to create a web app
   - Copy the `firebaseConfig` object

## Step 2: Environment Variables Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Firebase configuration in `.env`:
   ```bash
   # Firebase configuration for backend (Rust)
   FIREBASE_PROJECT_ID="your-project-id"

   # Firebase configuration for frontend (Vite/SvelteKit)
   VITE_FIREBASE_API_KEY="your-api-key"
   VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="your-project-id"
   VITE_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
   VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
   VITE_FIREBASE_APP_ID="your-app-id"
   VITE_FIREBASE_MEASUREMENT_ID="your-measurement-id"
   ```

## Step 3: Install Dependencies

Frontend dependencies should already be installed, but if needed:
```bash
npm install firebase @tauri-apps/api @tauri-apps/plugin-store
```

Backend dependencies are already configured in `Cargo.toml`.

## Step 4: Build and Run

1. Build the Tauri application:
   ```bash
   npm run tauri build
   ```

2. Or run in development mode:
   ```bash
   npm run tauri dev
   ```

## How It Works

### Frontend (SvelteKit)
- **Firebase Authentication**: Uses Firebase JS SDK for user authentication
- **Token Storage**: Securely stores ID tokens using Tauri's store plugin
- **State Management**: Svelte stores manage authentication state
- **Components**: 
  - `AuthButton.svelte`: Sign in/out functionality
  - `ProtectedRoute.svelte`: Route protection wrapper

### Backend (Rust)
- **Token Verification**: Verifies Firebase ID tokens using Google's public keys
- **JWT Validation**: Validates token signature, audience, and issuer
- **Protected Commands**: Tauri commands that require authentication
- **Key Caching**: Caches Google's public keys for performance

### Security Flow
1. User signs in via Firebase on frontend
2. Frontend receives and stores ID token securely
3. For protected operations, frontend sends token to Rust backend
4. Backend verifies token cryptographically with Google's public keys
5. Backend executes protected operation only if token is valid

## Available Routes

- `/` - Home page with authentication status
- `/profile` - Protected profile page (requires authentication)

## Available Components

- `AuthButton` - Authentication button with user dropdown
- `ProtectedRoute` - Wrapper for protected content

## Available Functions

### Frontend (`$lib/auth.ts`)
- `verifyToken()` - Verify current token with backend
- `getUserProfile()` - Get user profile from backend
- `executeProtectedAction()` - Execute protected backend operation
- `refreshToken()` - Refresh Firebase token

### Backend (`src-tauri/src/auth.rs`)
- `verify_firebase_token` - Verify Firebase ID token
- `get_user_profile` - Get user profile from token claims
- `protected_action` - Example protected operation

## Troubleshooting

### Common Issues

1. **Environment variables not loading**
   - Make sure `.env` file is in the project root
   - Restart the development server after changing `.env`

2. **Token verification fails**
   - Check that `FIREBASE_PROJECT_ID` matches your actual Firebase project ID
   - Ensure Firebase project has Authentication enabled

3. **CORS issues**
   - Make sure your domain is added to Firebase Auth authorized domains

4. **Store plugin errors**
   - Ensure `@tauri-apps/plugin-store` is properly installed
   - Check that the store plugin is registered in `main.rs`

### Debug Tips

- Check browser console for frontend errors
- Check terminal output for backend errors
- Use the "Verify Token with Backend" button on home page to test token verification
- Check Firebase Console > Authentication > Users to see registered users

## Next Steps

1. Customize the authentication UI to match your design
2. Add more authentication providers (Apple, GitHub, etc.)
3. Implement user profile management
4. Add role-based access control
5. Set up Firestore security rules for data access

## Security Notes

- Never expose Firebase Admin SDK credentials to the frontend
- Always verify tokens on the backend before performing sensitive operations
- Use HTTPS in production
- Regularly rotate Firebase service account keys
- Implement proper error handling to avoid information leakage
