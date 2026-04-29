// Stripe webhook handlers for Replit integration
// Based on stripe-replit-sync blueprint

import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    // Process the webhook with stripe-replit-sync
    await sync.processWebhook(payload, signature, uuid);
    
    // Additional custom handling for subscription events
    // This updates the user's subscription status in our database
    try {
      const event = JSON.parse(payload.toString());
      await WebhookHandlers.handleCustomEvents(event);
    } catch (error) {
      console.error('Error in custom webhook handling:', error);
      // Don't throw - the main sync already succeeded
    }
  }

  static async handleCustomEvents(event: any): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;
        
        // Update user subscription status based on Stripe subscription status
        const subscriptionStatus = status === 'active' || status === 'trialing' ? 'PRO' : 'FREE';
        
        const updateData: any = {
          subscriptionStatus,
          stripeSubscriptionId: subscription.id,
        };

        // Stamp trial dates so the user can't claim a second free trial
        if (status === 'trialing' && subscription.trial_start && subscription.trial_end) {
          updateData.trialStart = new Date(subscription.trial_start * 1000);
          updateData.trialEnd = new Date(subscription.trial_end * 1000);
          updateData.trialSource = 'stripe_checkout';
        }

        // Mirror Stripe pause_collection state locally so the UI can show resume button
        const pauseCollection = subscription.pause_collection;
        if (pauseCollection) {
          updateData.subscriptionPaused = true;
          updateData.pauseResumesAt = pauseCollection.resumes_at
            ? new Date(pauseCollection.resumes_at * 1000)
            : null;
        } else {
          updateData.subscriptionPaused = false;
          updateData.pauseResumesAt = null;
        }

        // Find user by Stripe customer ID and update their subscription
        await storage.updateUserByStripeCustomerId(customerId, updateData);
        
        console.log(`Updated subscription for customer ${customerId}: ${subscriptionStatus}${status === 'trialing' ? ' (trialing)' : ''}`);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Downgrade user to free tier and stamp cancelledAt so the win-back
        // job can find them on day 7
        await storage.updateUserByStripeCustomerId(customerId, {
          subscriptionStatus: 'FREE',
          stripeSubscriptionId: null,
          cancelledAt: new Date(),
        });

        console.log(`Subscription cancelled for customer ${customerId}`);
        break;
      }
      
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const customerId = session.customer;
          
          // Update user with subscription info
          await storage.updateUserByStripeCustomerId(customerId, {
            subscriptionStatus: 'PRO',
            stripeSubscriptionId: session.subscription,
          });
          
          console.log(`Checkout completed for customer ${customerId}`);
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        
        console.log(`Payment failed for customer ${customerId}`);
        // Optionally handle payment failure (e.g., send notification)
        break;
      }
    }
  }
}
