import { Component } from '@angular/core';
import { GrpcAuthService } from 'src/app/services/grpc-auth.service';

@Component({
  selector: 'cnsl-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  standalone: false,
})
export class FooterComponent {
  constructor(public authService: GrpcAuthService) {}
}
