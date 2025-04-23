/**
 * Service for managing users in Avianet Vision
 * Provides functionality to add, edit, delete and authenticate users
 */

// We'll use local storage as our "database" for now
const USERS_STORAGE_KEY = 'avianet-vision-users';
const CURRENT_USER_KEY = 'avianet-vision-current-user';

export type UserRole = 'admin' | 'operator' | 'standard';

export interface User {
  id: string;
  username: string;
  password: string; // In a real app, this would be hashed
  email: string;
  fullName: string;
  role: UserRole;
  assignedCameraIds: string[];
  lastLogin?: Date;
}

export interface UserFormData extends Partial<Omit<User, 'id' | 'lastLogin'>> {
  id?: string;
}

/**
 * Initialize default admin user if no users exist
 */
const initializeDefaultAdmin = (): void => {
  const users = getAllUsers();
  if (users.length === 0) {
    // Create default admin user
    const adminUser: Omit<User, 'id'> = {
      username: 'admin',
      password: 'admin',
      email: 'admin@example.com',
      fullName: 'Administrator',
      role: 'admin',
      assignedCameraIds: []
    };
    addUser(adminUser);
  }
};

/**
 * Get all users from storage
 */
const getAllUsers = (): User[] => {
  try {
    const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsers) {
      return JSON.parse(storedUsers);
    }
  } catch (error) {
    console.error('Failed to load users from storage:', error);
  }
  
  return [];
};

/**
 * Get a single user by ID
 */
const getUserById = (id: string): User | undefined => {
  const users = getAllUsers();
  return users.find(user => user.id === id);
};

/**
 * Get a user by username
 */
const getUserByUsername = (username: string): User | undefined => {
  const users = getAllUsers();
  return users.find(user => user.username === username);
};

/**
 * Add a new user
 */
const addUser = (user: Omit<User, 'id'>): User => {
  const users = getAllUsers();
  
  // Check if username already exists
  if (users.some(u => u.username === user.username)) {
    throw new Error(`Username ${user.username} already exists`);
  }
  
  const newUser: User = {
    ...user,
    id: Date.now().toString()
  };
  
  users.push(newUser);
  saveUsers(users);
  
  return newUser;
};

/**
 * Update an existing user
 */
const updateUser = (user: User): User => {
  const users = getAllUsers();
  const index = users.findIndex(u => u.id === user.id);
  
  if (index !== -1) {
    // Check if username already exists for a different user
    const existingUser = users.find(u => u.username === user.username && u.id !== user.id);
    if (existingUser) {
      throw new Error(`Username ${user.username} already exists`);
    }
    
    users[index] = {
      ...users[index],
      ...user
    };
    
    saveUsers(users);
    return users[index];
  }
  
  throw new Error(`User with id ${user.id} not found`);
};

/**
 * Delete a user by ID
 */
const deleteUser = (id: string): boolean => {
  const users = getAllUsers();
  const filteredUsers = users.filter(user => user.id !== id);
  
  if (filteredUsers.length < users.length) {
    saveUsers(filteredUsers);
    return true;
  }
  
  return false;
};

/**
 * Save users array to storage
 */
const saveUsers = (users: User[]): void => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Failed to save users to storage:', error);
  }
};

/**
 * Authenticate a user by username and password
 * Returns the user if authenticated, undefined otherwise
 */
const authenticateUser = (username: string, password: string): User | undefined => {
  const user = getUserByUsername(username);
  if (user && user.password === password) {
    // Update last login time
    const updatedUser = {
      ...user,
      lastLogin: new Date()
    };
    updateUser(updatedUser);
    
    // Store current user in session
    setCurrentUser(updatedUser);
    
    return updatedUser;
  }
  return undefined;
};

/**
 * Get the currently logged in user
 */
const getCurrentUser = (): User | undefined => {
  try {
    const currentUser = localStorage.getItem(CURRENT_USER_KEY);
    if (currentUser) {
      return JSON.parse(currentUser);
    }
  } catch (error) {
    console.error('Failed to load current user from storage:', error);
  }
  
  return undefined;
};

/**
 * Set the current user in storage
 */
const setCurrentUser = (user: User): void => {
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to save current user to storage:', error);
  }
};

/**
 * Logout the current user
 */
const logout = (): void => {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (error) {
    console.error('Failed to remove current user from storage:', error);
  }
};

/**
 * Check if a user has a specific permission based on their role
 */
const hasPermission = (user: User | undefined, permission: string): boolean => {
  if (!user) return false;
  
  // Define permissions for each role
  const rolePermissions: Record<UserRole, string[]> = {
    admin: [
      'view_cameras', 
      'edit_cameras', 
      'upload_ai_models', 
      'assign_cameras', 
      'manage_users', 
      'system_settings'
    ],
    operator: [
      'view_cameras', 
      'edit_assigned_cameras',
      'upload_ai_models'
    ],
    standard: [
      'view_assigned_cameras'
    ]
  };
  
  return rolePermissions[user.role].includes(permission);
};

/**
 * Check if a user can access a specific camera
 */
const canAccessCamera = (user: User | undefined, cameraId: string): boolean => {
  if (!user) return false;
  
  // Admin can access all cameras
  if (user.role === 'admin') return true;
  
  // Other roles can access only assigned cameras
  return user.assignedCameraIds.includes(cameraId);
};

/**
 * Assign cameras to a user
 */
const assignCamerasToUser = (userId: string, cameraIds: string[]): User => {
  const user = getUserById(userId);
  if (!user) {
    throw new Error(`User with id ${userId} not found`);
  }
  
  const updatedUser = {
    ...user,
    assignedCameraIds: cameraIds
  };
  
  return updateUser(updatedUser);
};

/**
 * Change user password
 */
const changePassword = (userId: string, oldPassword: string, newPassword: string): boolean => {
  const user = getUserById(userId);
  if (!user) {
    throw new Error(`User with id ${userId} not found`);
  }
  
  if (user.password !== oldPassword) {
    throw new Error('Incorrect password');
  }
  
  const updatedUser = {
    ...user,
    password: newPassword
  };
  
  updateUser(updatedUser);
  return true;
};

// Initialize the default admin user when the service is imported
initializeDefaultAdmin();

const UserService = {
  getAllUsers,
  getUserById,
  getUserByUsername,
  addUser,
  updateUser,
  deleteUser,
  authenticateUser,
  getCurrentUser,
  logout,
  hasPermission,
  canAccessCamera,
  assignCamerasToUser,
  changePassword
};

export default UserService;
