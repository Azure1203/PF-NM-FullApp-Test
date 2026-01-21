import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      
      // Whitelist enforcement: check if user is allowed
      const whitelistEmpty = await storage.isWhitelistEmpty();
      if (!whitelistEmpty) {
        // Whitelist has entries - user must be on it
        const isAllowed = await storage.isUserAllowed(
          req.user.claims.username || '',
          user?.email || ''
        );
        if (!isAllowed) {
          console.log(`[Auth] Access denied for user: ${user?.email || req.user.claims.username} (not on whitelist)`);
          return res.status(403).json({ 
            message: "Access denied. Your account is not on the allowed users list.",
            notAllowed: true
          });
        }
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
