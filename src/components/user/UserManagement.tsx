
import React, { useState, useEffect } from 'react';
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import UserService, { User } from '@/services/UserService';
import { useAuth } from '@/contexts/AuthContext';
import { Edit, MoreHorizontal, Trash2, UserPlus } from 'lucide-react';
import UserForm from './UserForm';
import UserAssignCameras from './UserAssignCameras';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [isAssignCamerasOpen, setIsAssignCamerasOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  useEffect(() => {
    loadUsers();
  }, []);
  
  const loadUsers = () => {
    const allUsers = UserService.getAllUsers();
    setUsers(allUsers);
  };
  
  const handleAddUser = () => {
    setSelectedUser(null);
    setIsUserFormOpen(true);
  };
  
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsUserFormOpen(true);
  };
  
  const handleDeleteUser = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };
  
  const confirmDeleteUser = () => {
    if (selectedUser) {
      // Prevent deleting yourself
      if (selectedUser.id === currentUser?.id) {
        toast.error("You cannot delete your own account");
        return;
      }
      
      try {
        UserService.deleteUser(selectedUser.id);
        toast.success(`User ${selectedUser.username} deleted successfully`);
        loadUsers();
      } catch (error) {
        toast.error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsDeleteDialogOpen(false);
        setSelectedUser(null);
      }
    }
  };
  
  const handleAssignCameras = (user: User) => {
    setSelectedUser(user);
    setIsAssignCamerasOpen(true);
  };
  
  const handleUserSaved = (user: User) => {
    setIsUserFormOpen(false);
    loadUsers();
    toast.success(`User ${user.username} saved successfully`);
  };
  
  const handleCamerasAssigned = () => {
    setIsAssignCamerasOpen(false);
    loadUsers();
    toast.success('Camera assignments updated successfully');
  };
  
  const formatLastLogin = (date?: Date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        <Button onClick={handleAddUser}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>
      
      <div className="bg-card rounded-md border shadow-sm overflow-hidden">
        <Table>
          <TableCaption>Manage users and their permissions</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.fullName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <span className="capitalize">{user.role}</span>
                </TableCell>
                <TableCell>{formatLastLogin(user.lastLogin)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditUser(user)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem onClick={() => handleAssignCameras(user)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Assign Cameras
                      </DropdownMenuItem>
                      
                      {/* Don't allow deleting your own account */}
                      {user.id !== currentUser?.id && (
                        <DropdownMenuItem 
                          onClick={() => handleDeleteUser(user)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      <Dialog open={isUserFormOpen} onOpenChange={setIsUserFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {selectedUser 
                ? 'Edit user information and permissions.' 
                : 'Add a new user with appropriate role and permissions.'}
            </DialogDescription>
          </DialogHeader>
          
          <UserForm 
            user={selectedUser} 
            onSave={handleUserSaved} 
            onCancel={() => setIsUserFormOpen(false)} 
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={isAssignCamerasOpen} onOpenChange={setIsAssignCamerasOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Assign Cameras</DialogTitle>
            <DialogDescription>
              {selectedUser && `Manage camera access for ${selectedUser.username}`}
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <UserAssignCameras
              user={selectedUser}
              onSave={handleCamerasAssigned}
              onCancel={() => setIsAssignCamerasOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the user "{selectedUser?.username}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
