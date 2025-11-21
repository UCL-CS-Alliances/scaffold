import { Button, Typography, Container } from "@mui/material";

export default function HomePage() {
  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Alliances Platform – Dev Setup
      </Typography>
      <Button variant="contained">Hello from MUI</Button>
    </Container>
  );
}
