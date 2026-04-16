import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg" data-testid="not-found-card">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
              <Compass className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-not-found-title">
              Page not found
            </h1>
            <p className="mt-2 text-muted-foreground" data-testid="text-not-found-description">
              The page you're looking for doesn't exist or has moved.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                data-testid="button-go-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go back
              </Button>
              <Link href="/">
                <Button className="w-full" data-testid="link-home">
                  <Home className="h-4 w-4 mr-2" />
                  Back to home
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
