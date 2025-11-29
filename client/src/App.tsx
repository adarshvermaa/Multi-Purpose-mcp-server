import { useRoutes } from "react-router-dom";
import { routes } from "./router";
import AppLayout from "./layout/AppLayout";

export default function App() {
  const element = useRoutes(routes); // dynamic routes

  return <AppLayout>{element}</AppLayout>;
}
