import { useAuth } from "../context/AuthContext.jsx";

const LoginButton = () => {
  const { loginWithGoogle, currentUser, logout } = useAuth();

  if (currentUser) {
    return (
      <div>
        <img src={currentUser.photoURL} alt="Profile" width="30" />
        <p>Welcome, {currentUser.displayName}</p>
        <button className="btn secondary" type="button" onClick={logout}>
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button className="btn" type="button" onClick={loginWithGoogle}>
      Sign in with Google
    </button>
  );
};

export default LoginButton;
